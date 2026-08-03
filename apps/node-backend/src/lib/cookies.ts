import type { CookieOptions, Response } from "express";
import { env } from "../config/env";

export const REFRESH_TOKEN_COOKIE_NAME = "refreshToken";

// Scoped to /auth since it's only ever needed by the refresh/logout
// endpoints — no reason to hand it to every route on the API.
const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/auth",
};

export function setRefreshTokenCookie(res: Response, refreshToken: string, expiresAt: Date): void {
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, { ...baseCookieOptions, expires: expiresAt });
}

export function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, baseCookieOptions);
}
