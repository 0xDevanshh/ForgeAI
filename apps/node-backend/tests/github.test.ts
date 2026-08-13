import { randomUUID } from "node:crypto";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app";
import { env } from "../src/config/env";
import { decrypt, encrypt } from "../src/lib/encryption";
import { prisma } from "../src/lib/prisma";
import { redisClient } from "../src/services/redisClient";

const STRONG_PASSWORD = "Str0ng!Pass1";
const MOCK_GITHUB_ACCESS_TOKEN = "gho_mock-access-token-1234567890";
const MOCK_GITHUB_USERNAME = "octocat";
const MOCK_REPO = {
  id: 123456,
  full_name: "octocat/Hello-World",
  private: false,
  default_branch: "main",
  language: "TypeScript",
  updated_at: "2024-01-01T00:00:00Z",
};

let reposCallCount = 0;

const server = setupServer(
  http.post("https://github.com/login/oauth/access_token", () =>
    HttpResponse.json({
      access_token: MOCK_GITHUB_ACCESS_TOKEN,
      token_type: "bearer",
      scope: "repo,read:user",
    }),
  ),
  http.get("https://api.github.com/user", () => HttpResponse.json({ login: MOCK_GITHUB_USERNAME, id: 1 })),
  http.get("https://api.github.com/user/repos", () => {
    reposCallCount++;
    return HttpResponse.json([MOCK_REPO], {
      headers: {
        "x-ratelimit-remaining": "4999",
        "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 3600),
      },
    });
  }),
);

// "bypass" (not "error"): supertest makes a real loopback HTTP request to
// this app's own ephemeral local server, and MSW's interceptor sees that
// traffic too — "error" would crash on it since it never matches a GitHub
// handler. "bypass" mocks only what we've defined and lets everything else
// (our own app, Postgres/Redis over non-HTTP protocols) through untouched.
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
beforeEach(() => {
  reposCallCount = 0;
});
afterAll(() => server.close());

function uniqueEmail(label: string): string {
  return `github-test-${label}-${randomUUID()}@example.com`;
}

async function signupUser(email: string): Promise<{ accessToken: string; userId: string }> {
  const res = await request(app).post("/auth/signup").send({ email, password: STRONG_PASSWORD });
  return { accessToken: res.body.accessToken as string, userId: res.body.user.id as string };
}

function extractState(location: string): string {
  const state = new URL(location).searchParams.get("state");
  if (!state) throw new Error(`no state param in redirect location: ${location}`);
  return state;
}

// Per-test emails are tracked and deleted immediately in afterEach (cascades
// to Repo/RefreshToken rows) so this suite never leaves rows behind in the
// dev DB it shares with everything else.
let testEmails: string[] = [];

afterEach(async () => {
  if (testEmails.length > 0) {
    await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
    testEmails = [];
  }
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: "github-test-" } } });
});

describe("GitHub OAuth connect flow", () => {
  it("sends an unauthenticated /auth/github/connect to sign-in, not to GitHub", async () => {
    const res = await request(app).get("/auth/github/connect");

    // The browser reaches this by top-level navigation, so authenticateNavigation
    // answers with a redirect rather than a JSON 401 that would render as raw
    // text in the address bar.
    expect(res.status).toBe(302);
    // Asserting the destination, not just the status: a bare 302 check would
    // still pass if an anonymous visitor were handed GitHub's consent screen.
    expect(res.headers.location).toBe(`${env.FRONTEND_URL}/login`);
    expect(res.headers.location).not.toContain("github.com");
  });

  it("redirects to github.com with a valid state param stored in Redis", async () => {
    const email = uniqueEmail("connect-redirect");
    testEmails.push(email);
    const { accessToken } = await signupUser(email);

    const res = await request(app).get("/auth/github/connect").set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(302);
    const location = new URL(res.headers.location as string);
    expect(location.host).toBe("github.com");
    expect(location.pathname).toBe("/login/oauth/authorize");

    const state = extractState(res.headers.location as string);
    const stored = await redisClient.get(`oauth:github:state:${state}`);
    expect(stored).toBeTruthy();
  });

  it("redirects to the frontend error page on an invalid state, storing no token", async () => {
    const email = uniqueEmail("callback-invalid-state");
    testEmails.push(email);
    const { userId } = await signupUser(email);

    const res = await request(app)
      .get("/auth/github/callback")
      .query({ code: "whatever", state: "not-a-real-state" });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("error=oauth_failed");

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.githubAccessToken).toBeNull();
  });

  it("stores an encrypted access token and githubUsername on a valid callback", async () => {
    const email = uniqueEmail("callback-valid-state");
    testEmails.push(email);
    const { accessToken, userId } = await signupUser(email);

    const connectRes = await request(app)
      .get("/auth/github/connect")
      .set("Authorization", `Bearer ${accessToken}`);
    const state = extractState(connectRes.headers.location as string);

    const callbackRes = await request(app).get("/auth/github/callback").query({ code: "mock-code", state });

    expect(callbackRes.status).toBe(302);
    expect(callbackRes.headers.location).toContain("github=connected");

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.githubUsername).toBe(MOCK_GITHUB_USERNAME);
    expect(user.githubAccessToken).not.toBeNull();
    // Stored value must not be the plaintext token — confirms it's encrypted.
    expect(user.githubAccessToken).not.toBe(MOCK_GITHUB_ACCESS_TOKEN);
    expect(decrypt(user.githubAccessToken as string)).toBe(MOCK_GITHUB_ACCESS_TOKEN);
  });
});

describe("GitHub repos", () => {
  it("returns 400 GITHUB_NOT_CONNECTED when the user hasn't linked GitHub", async () => {
    const email = uniqueEmail("repos-not-connected");
    testEmails.push(email);
    const { accessToken } = await signupUser(email);

    const res = await request(app).get("/github/repos").set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("GITHUB_NOT_CONNECTED");
  });

  it("returns the repo list when connected, and serves the second call from cache", async () => {
    const email = uniqueEmail("repos-cache");
    testEmails.push(email);
    const { accessToken, userId } = await signupUser(email);

    await prisma.user.update({
      where: { id: userId },
      data: { githubAccessToken: encrypt(MOCK_GITHUB_ACCESS_TOKEN), githubUsername: MOCK_GITHUB_USERNAME },
    });

    const first = await request(app).get("/github/repos").set("Authorization", `Bearer ${accessToken}`);
    expect(first.status).toBe(200);
    expect(first.body.repos).toHaveLength(1);
    expect(first.body.repos[0].fullName).toBe("octocat/Hello-World");

    const second = await request(app).get("/github/repos").set("Authorization", `Bearer ${accessToken}`);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);

    // The mock should only have been hit once — the second call was a cache hit.
    expect(reposCallCount).toBe(1);
  });
});

describe("Repo registration", () => {
  it("returns 409 when registering a repo the user already has", async () => {
    const email = uniqueEmail("repos-duplicate");
    testEmails.push(email);
    const { accessToken, userId } = await signupUser(email);

    const seeded = await prisma.repo.create({
      data: {
        userId,
        githubRepoId: "778899",
        fullName: "octocat/Already-Added",
        defaultBranch: "main",
        indexStatus: "PENDING",
      },
    });

    const res = await request(app)
      .post("/repos")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ githubRepoId: "778899", fullName: "octocat/Already-Added" });

    expect(res.status).toBe(409);
    expect(res.body.repoId).toBe(seeded.id);
  });

  it("returns 404 when deleting a repo owned by a different user", async () => {
    const emailOwner = uniqueEmail("repos-delete-owner");
    const emailOther = uniqueEmail("repos-delete-other");
    testEmails.push(emailOwner, emailOther);

    const owner = await signupUser(emailOwner);
    const other = await signupUser(emailOther);

    const repo = await prisma.repo.create({
      data: {
        userId: owner.userId,
        githubRepoId: "445566",
        fullName: "octocat/Owner-Only",
        defaultBranch: "main",
        indexStatus: "PENDING",
      },
    });

    const res = await request(app)
      .delete(`/repos/${repo.id}`)
      .set("Authorization", `Bearer ${other.accessToken}`);

    expect(res.status).toBe(404);

    const stillThere = await prisma.repo.findUnique({ where: { id: repo.id } });
    expect(stillThere).not.toBeNull();
  });
});
