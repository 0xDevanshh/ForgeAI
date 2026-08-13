import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { REFRESH_TOKEN_COOKIE_NAME } from "../lib/cookies";
import { logger } from "../lib/logger";
import { getUserFromRefreshToken, verifyAccessToken } from "../services/token.service";

const BEARER_PREFIX = "Bearer ";

/**
 * Authenticates endpoints the browser reaches by **top-level navigation**
 * rather than by fetch/XHR — currently only GET /auth/github/connect, which
 * answers with a 302 to GitHub's consent screen.
 *
 * Such a request cannot carry an Authorization header: the web app keeps its
 * access token in memory (never localStorage, by design), and a plain
 * navigation sends cookies only. So this falls back to the httpOnly refresh
 * cookie, which is already scoped to path=/auth and therefore reaches here.
 *
 * ---------------------------------------------------------------------------
 * Why this is a separate middleware and NOT a fallback added to `authenticate`
 * ---------------------------------------------------------------------------
 * The refresh token lives 30 days; the access token lives 15 minutes. That gap
 * is the entire point of the split. Accepting the refresh cookie as general API
 * auth would quietly promote a long-lived credential into a session bearer and
 * erase that design, so this stays scoped to the one route that genuinely
 * cannot use a header.
 *
 * CSRF: the refresh cookie is SameSite=Strict, so a browser will not attach it
 * to a cross-site top-level navigation — a third-party page linking here gets
 * an unauthenticated request, not the user's session. The OAuth callback is
 * separately protected by its single-use `state` value.
 */
export async function authenticateNavigation(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // A Bearer header still wins when present, so API clients and tests keep
  // working exactly as they did.
  const header = req.headers.authorization;
  if (header?.startsWith(BEARER_PREFIX)) {
    try {
      const payload = verifyAccessToken(header.slice(BEARER_PREFIX.length));
      req.user = { id: payload.sub, email: payload.email };
      next();
      return;
    } catch {
      // Fall through — an expired header shouldn't block a valid cookie.
    }
  }

  const rawToken = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME] as string | undefined;
  if (rawToken) {
    try {
      const user = await getUserFromRefreshToken(rawToken);
      req.user = { id: user.id, email: user.email };
      next();
      return;
    } catch {
      logger.warn("Navigation auth rejected: refresh cookie invalid, expired, or revoked");
    }
  }

  // A JSON 401 would render as raw text in the address bar. Sending them to
  // sign in is the only useful answer for a navigation.
  res.redirect(`${env.FRONTEND_URL}/login`);
}
