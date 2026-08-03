import type { Request, Response } from "express";
import { env } from "../config/env";
import { encrypt } from "../lib/encryption";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import {
  consumeGithubOAuthState,
  createGithubOAuthState,
  exchangeGithubCodeForAccessToken,
  fetchGithubUserProfile,
  listUserRepos,
} from "../services/github.service";

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_SCOPES = "repo read:user";

// GET /auth/github/connect — requires authenticate. This links GitHub to an
// already-logged-in account; it is not a "sign in with GitHub" flow.
export async function connect(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new AppError("Unauthorized", 401);
  }

  const { id: userId } = req.user;
  const state = await createGithubOAuthState(userId);

  logger.info({ userId }, "GitHub OAuth connect initiated");

  const authorizeUrl = new URL(GITHUB_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", env.GITHUB_CALLBACK_URL);
  authorizeUrl.searchParams.set("scope", GITHUB_SCOPES);
  authorizeUrl.searchParams.set("state", state);

  res.redirect(authorizeUrl.toString());
}

// POST /auth/github/disconnect — requires authenticate. Clears the stored
// credential/username but deliberately leaves any already-indexed Repo rows
// alone: disconnecting should block new GitHub operations, not destroy
// indexing work that already happened.
export async function disconnect(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new AppError("Unauthorized", 401);
  }

  const { id: userId } = req.user;

  await prisma.user.update({
    where: { id: userId },
    data: { githubAccessToken: null, githubUsername: null },
  });

  logger.info({ userId }, "GitHub account disconnected");

  res.status(200).json({ message: "GitHub account disconnected" });
}

function parsePageParam(value: unknown): number {
  if (typeof value !== "string") return 1;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

// GET /github/repos — requires authenticate.
export async function listRepos(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new AppError("Unauthorized", 401);
  }

  const page = parsePageParam(req.query.page);
  const result = await listUserRepos(req.user.id, page);

  res.status(200).json(result);
}

const FAILURE_REDIRECT = `${env.FRONTEND_URL}/settings?error=oauth_failed`;

function failConnect(reason: string, meta: Record<string, unknown>, res: Response): void {
  logger.warn({ ...meta, reason }, "GitHub OAuth connect failed");
  res.redirect(FAILURE_REDIRECT);
}

// GET /auth/github/callback — no authenticate middleware: GitHub redirects
// the bare browser here with no Authorization header available. Identity
// and CSRF protection both come from the single-use `state` value instead.
export async function callback(req: Request, res: Response): Promise<void> {
  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  const state = typeof req.query.state === "string" ? req.query.state : undefined;

  if (!code || !state) {
    failConnect("missing_code_or_state", {}, res);
    return;
  }

  const userId = await consumeGithubOAuthState(state);

  if (!userId) {
    failConnect("invalid_or_expired_state", {}, res);
    return;
  }

  let accessToken: string;
  try {
    accessToken = await exchangeGithubCodeForAccessToken(code);
  } catch (err) {
    failConnect("token_exchange_failed", { userId, err }, res);
    return;
  }

  let githubUsername: string;
  try {
    ({ username: githubUsername } = await fetchGithubUserProfile(accessToken));
  } catch (err) {
    failConnect("fetch_profile_failed", { userId, err }, res);
    return;
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        githubAccessToken: encrypt(accessToken),
        githubUsername,
      },
    });
  } catch (err) {
    failConnect("db_update_failed", { userId, err }, res);
    return;
  }

  logger.info({ userId, githubUsername }, "GitHub account connected successfully");
  res.redirect(`${env.FRONTEND_URL}/settings?github=connected`);
}
