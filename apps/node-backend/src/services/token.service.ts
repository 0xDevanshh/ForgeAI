import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import type { User } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { AppError, TokenExpiredError } from "../middleware/errorHandler";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const INVALID_REFRESH_MESSAGE = "Invalid or expired refresh token";

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface RotationResult extends TokenPair {
  user: User;
}

function signAccessToken(user: Pick<User, "id" | "email">): string {
  const payload: AccessTokenPayload = { sub: user.id, email: user.email };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  let decoded: string | jwt.JwtPayload;

  try {
    decoded = jwt.verify(token, env.JWT_SECRET);
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new TokenExpiredError();
    }
    throw new AppError("Invalid or expired access token", 401);
  }

  if (typeof decoded === "string" || typeof decoded.sub !== "string" || typeof decoded.email !== "string") {
    throw new AppError("Invalid or expired access token", 401);
  }

  return { sub: decoded.sub, email: decoded.email };
}

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

async function createRefreshToken(userId: string): Promise<{ id: string; rawToken: string; expiresAt: Date }> {
  const rawToken = randomBytes(64).toString("hex");
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  const created = await prisma.refreshToken.create({
    data: { userId, tokenHash: hashToken(rawToken), expiresAt },
  });

  return { id: created.id, rawToken, expiresAt };
}

export async function issueTokenPair(user: Pick<User, "id" | "email">): Promise<TokenPair> {
  const { rawToken, expiresAt } = await createRefreshToken(user.id);

  return {
    accessToken: signAccessToken(user),
    refreshToken: rawToken,
    refreshTokenExpiresAt: expiresAt,
  };
}

async function revokeAllUserTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// Single-use rotation: the presented token is revoked and replaced with a
// freshly issued one every time it's redeemed. If a token that's already
// been rotated away gets presented again, that's the signature of a stolen
// token being replayed after the legitimate client already moved on — so
// the whole family is revoked instead of just rejecting the one request.
export async function rotateRefreshToken(rawToken: string): Promise<RotationResult> {
  const tokenHash = hashToken(rawToken);
  const existing = await prisma.refreshToken.findFirst({
    where: { tokenHash },
    include: { user: true },
  });

  if (!existing) {
    throw new AppError(INVALID_REFRESH_MESSAGE, 401);
  }

  if (existing.revokedAt) {
    await revokeAllUserTokens(existing.userId);
    throw new AppError(INVALID_REFRESH_MESSAGE, 401);
  }

  if (existing.expiresAt.getTime() <= Date.now()) {
    throw new AppError(INVALID_REFRESH_MESSAGE, 401);
  }

  const next = await createRefreshToken(existing.userId);

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date(), replacedBy: next.id },
  });

  return {
    accessToken: signAccessToken(existing.user),
    refreshToken: next.rawToken,
    refreshTokenExpiresAt: next.expiresAt,
    user: existing.user,
  };
}

export async function revokeRefreshToken(rawToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
