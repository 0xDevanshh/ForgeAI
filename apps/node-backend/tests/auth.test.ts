import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { app } from "../src/app";
import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";

const STRONG_PASSWORD = "Str0ng!Pass1";

function uniqueEmail(label: string): string {
  return `auth-test-${label}-${randomUUID()}@example.com`;
}

function extractRefreshCookie(res: { headers: Record<string, unknown> }): string {
  const setCookie = res.headers["set-cookie"] as string[] | string | undefined;
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];

  for (const cookie of cookies) {
    const match = /^refreshToken=([^;]+)/.exec(cookie);
    if (match) return match[1];
  }

  throw new Error("refreshToken cookie not found in response");
}

// Per-test emails are tracked and deleted immediately in afterEach (cascades
// to RefreshToken rows) so this suite never leaves rows behind in the dev DB
// it shares with everything else. The auth-test- prefix also lets a crashed
// run be cleaned up by hand if it ever gets that far.
let testEmails: string[] = [];

afterEach(async () => {
  if (testEmails.length > 0) {
    await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
    testEmails = [];
  }
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: "auth-test-" } } });
});

describe("auth flow", () => {
  it("signup with valid data returns 201, an access token, and sets the refresh cookie", async () => {
    const email = uniqueEmail("signup-ok");
    testEmails.push(email);

    const res = await request(app).post("/auth/signup").send({ email, password: STRONG_PASSWORD });

    expect(res.status).toBe(201);
    expect(typeof res.body.accessToken).toBe("string");
    expect(res.body.user).toEqual({ id: expect.any(String), email });
    expect(extractRefreshCookie(res)).toBeTruthy();
  });

  it("signup with a weak password returns 400 with field-level password rule errors", async () => {
    const email = uniqueEmail("signup-weak");
    testEmails.push(email);

    const res = await request(app).post("/auth/signup").send({ email, password: "weak" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
    expect(Array.isArray(res.body.details)).toBe(true);

    const passwordErrors = res.body.details.filter((d: { field: string }) => d.field === "password");
    expect(passwordErrors.length).toBeGreaterThan(0);
    expect(passwordErrors.some((d: { message: string }) => /uppercase/i.test(d.message))).toBe(true);
    expect(passwordErrors.some((d: { message: string }) => /special character/i.test(d.message))).toBe(true);
  });

  it("signup with a duplicate email returns 409 with a generic message", async () => {
    const email = uniqueEmail("signup-dup");
    testEmails.push(email);

    const first = await request(app).post("/auth/signup").send({ email, password: STRONG_PASSWORD });
    expect(first.status).toBe(201);

    const second = await request(app).post("/auth/signup").send({ email, password: STRONG_PASSWORD });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe("Unable to create account with these details");
  });

  it("login with correct credentials returns 200 and an access token", async () => {
    const email = uniqueEmail("login-ok");
    testEmails.push(email);

    await request(app).post("/auth/signup").send({ email, password: STRONG_PASSWORD });

    const res = await request(app).post("/auth/login").send({ email, password: STRONG_PASSWORD });

    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe("string");
    expect(res.body.user.email).toBe(email);
  });

  it("locks the account after 5 failed logins, rejecting even the correct password on the 6th attempt", async () => {
    const email = uniqueEmail("lockout");
    testEmails.push(email);

    await request(app).post("/auth/signup").send({ email, password: STRONG_PASSWORD });

    for (let i = 0; i < 5; i++) {
      const res = await request(app).post("/auth/login").send({ email, password: "wrong-password" });
      expect(res.status).toBe(401);
    }

    const res = await request(app).post("/auth/login").send({ email, password: STRONG_PASSWORD });
    expect(res.status).toBe(423);
    expect(res.body.error).toMatch(/locked/i);
  });

  it("rotates the refresh token on /auth/refresh and revokes the old one in the DB", async () => {
    const email = uniqueEmail("refresh-rotate");
    testEmails.push(email);

    const signupRes = await request(app).post("/auth/signup").send({ email, password: STRONG_PASSWORD });
    const userId = signupRes.body.user.id as string;
    const originalRefreshToken = extractRefreshCookie(signupRes);

    const refreshRes = await request(app)
      .post("/auth/refresh")
      .set("Cookie", `refreshToken=${originalRefreshToken}`);

    expect(refreshRes.status).toBe(200);
    expect(typeof refreshRes.body.accessToken).toBe("string");

    const newRefreshToken = extractRefreshCookie(refreshRes);
    expect(newRefreshToken).toBeTruthy();
    expect(newRefreshToken).not.toBe(originalRefreshToken);

    const tokens = await prisma.refreshToken.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });

    expect(tokens).toHaveLength(2);
    expect(tokens[0].revokedAt).not.toBeNull();
    expect(tokens[0].replacedBy).toBe(tokens[1].id);
    expect(tokens[1].revokedAt).toBeNull();
  });

  it("rejects a reused (already-rotated) refresh token and revokes the whole token family", async () => {
    const email = uniqueEmail("refresh-reuse");
    testEmails.push(email);

    const signupRes = await request(app).post("/auth/signup").send({ email, password: STRONG_PASSWORD });
    const userId = signupRes.body.user.id as string;
    const originalRefreshToken = extractRefreshCookie(signupRes);

    // Rotate once so `originalRefreshToken` becomes stale.
    await request(app).post("/auth/refresh").set("Cookie", `refreshToken=${originalRefreshToken}`);

    // Replay the original (already-rotated-away) token.
    const replayRes = await request(app)
      .post("/auth/refresh")
      .set("Cookie", `refreshToken=${originalRefreshToken}`);

    expect(replayRes.status).toBe(401);
    expect(replayRes.body.error).toMatch(/invalid or expired refresh token/i);

    const tokens = await prisma.refreshToken.findMany({ where: { userId } });
    expect(tokens.length).toBeGreaterThanOrEqual(2);
    expect(tokens.every((t) => t.revokedAt !== null)).toBe(true);
  });

  it("rejects access to a protected route without a token", async () => {
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
  });

  it("rejects an expired access token with a TOKEN_EXPIRED code", async () => {
    const expiredToken = jwt.sign({ sub: randomUUID(), email: "expired@example.com" }, env.JWT_SECRET, {
      expiresIn: -10,
    });

    const res = await request(app).get("/auth/me").set("Authorization", `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("TOKEN_EXPIRED");
  });

  it("clears the refresh cookie on logout and invalidates the refresh token", async () => {
    const email = uniqueEmail("logout");
    testEmails.push(email);

    const signupRes = await request(app).post("/auth/signup").send({ email, password: STRONG_PASSWORD });
    const accessToken = signupRes.body.accessToken as string;
    const refreshToken = extractRefreshCookie(signupRes);

    const logoutRes = await request(app)
      .post("/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Cookie", `refreshToken=${refreshToken}`);

    expect(logoutRes.status).toBe(204);

    const setCookie = logoutRes.headers["set-cookie"] as string[] | undefined;
    expect(setCookie?.some((c) => /^refreshToken=;/.test(c))).toBe(true);

    const refreshAfterLogout = await request(app)
      .post("/auth/refresh")
      .set("Cookie", `refreshToken=${refreshToken}`);

    expect(refreshAfterLogout.status).toBe(401);
  });
});
