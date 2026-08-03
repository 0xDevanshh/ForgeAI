import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { clearRefreshTokenCookie, REFRESH_TOKEN_COOKIE_NAME, setRefreshTokenCookie } from "../lib/cookies";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import { authenticateUser, hashPassword } from "../services/auth.service";
import { issueTokenPair, revokeRefreshToken, rotateRefreshToken } from "../services/token.service";
import type { LoginInput, SignupInput } from "../validators/auth.validator";

// Deliberately generic — a distinct "email already exists" message would let
// an attacker enumerate registered accounts by probing /auth/signup.
const SIGNUP_CONFLICT_MESSAGE = "Unable to create account with these details";

export async function signup(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as SignupInput;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError(SIGNUP_CONFLICT_MESSAGE, 409);
  }

  const passwordHash = await hashPassword(password);

  let user;
  try {
    user = await prisma.user.create({ data: { email, passwordHash } });
  } catch (err) {
    // Guards the race between the check above and this insert — the @unique
    // constraint on email is the real source of truth.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(SIGNUP_CONFLICT_MESSAGE, 409);
    }
    throw err;
  }

  const tokens = await issueTokenPair(user);
  setRefreshTokenCookie(res, tokens.refreshToken, tokens.refreshTokenExpiresAt);

  res.status(201).json({
    accessToken: tokens.accessToken,
    user: { id: user.id, email: user.email },
  });
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as LoginInput;

  const user = await authenticateUser(email, password);
  const tokens = await issueTokenPair(user);
  setRefreshTokenCookie(res, tokens.refreshToken, tokens.refreshTokenExpiresAt);

  res.status(200).json({
    accessToken: tokens.accessToken,
    user: { id: user.id, email: user.email },
  });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const rawToken = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME] as string | undefined;

  if (!rawToken) {
    throw new AppError("Missing refresh token", 401);
  }

  const rotated = await rotateRefreshToken(rawToken);
  setRefreshTokenCookie(res, rotated.refreshToken, rotated.refreshTokenExpiresAt);

  res.status(200).json({ accessToken: rotated.accessToken });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const rawToken = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME] as string | undefined;

  if (rawToken) {
    await revokeRefreshToken(rawToken);
  }

  clearRefreshTokenCookie(res);
  res.status(204).send();
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.user?.id },
    select: { id: true, email: true, githubUsername: true, createdAt: true },
  });

  if (!user) {
    throw new AppError("User not found", 401);
  }

  res.status(200).json({ user });
}
