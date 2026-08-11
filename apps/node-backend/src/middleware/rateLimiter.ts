import type { NextFunction, Request, Response } from "express";
import rateLimit, { type RateLimitInfo, type RateLimitRequestHandler } from "express-rate-limit";
import { RedisStore, type RedisReply } from "rate-limit-redis";
import { env } from "../config/env";
import { redisClient } from "../services/redisClient";
import type { ApiErrorResponse } from "../types/http";

type RateLimitedRequest = Request & { rateLimit?: RateLimitInfo };

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;

async function sendCommand(...args: string[]): Promise<RedisReply> {
  const [command, ...rest] = args;
  const result = await redisClient.call(command, rest);
  return result as RedisReply;
}

// Integration tests hit real endpoints many times in quick succession from a
// single IP (e.g. 5 failed logins to trigger account lockout) and don't run
// against a live Redis — per-IP throttling would both need Redis and make
// those tests fail on request counts that have nothing to do with what
// they're actually testing.
function buildLimiter(options: {
  windowMs: number;
  max: number;
  prefix: string;
  // Defaults to express-rate-limit's own IP-based key. Pass this for a
  // per-user (rather than per-IP) limit — only safe to use after
  // `authenticate` has already run, since it needs req.user.
  keyGenerator?: (req: Request) => string;
}): RateLimitRequestHandler {
  if (env.NODE_ENV === "test") {
    return ((_req: Request, _res: Response, next: NextFunction) => next()) as RateLimitRequestHandler;
  }

  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true, // RateLimit-Limit / RateLimit-Remaining / RateLimit-Reset
    legacyHeaders: false, // no X-RateLimit-*
    keyGenerator: options.keyGenerator,
    store: new RedisStore({
      sendCommand,
      prefix: options.prefix,
    }),
    handler: (req: RateLimitedRequest, res: Response) => {
      const resetTime = req.rateLimit?.resetTime;
      const retryAfter = resetTime
        ? Math.max(0, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
        : Math.ceil(options.windowMs / 1000);

      res.setHeader("Retry-After", retryAfter);
      const body: ApiErrorResponse = { error: "TOO_MANY_REQUESTS", retryAfter };
      res.status(429).json(body);
    },
  });
}

/** Applied to every route: 100 requests / 15 min per IP. */
export const globalLimiter = buildLimiter({
  windowMs: FIFTEEN_MINUTES_MS,
  max: 100,
  prefix: "rl:global:",
});

/** Applied to /auth/login and /auth/signup only: 5 requests / 15 min per IP. */
export const strictAuthLimiter = buildLimiter({
  windowMs: FIFTEEN_MINUTES_MS,
  max: 5,
  prefix: "rl:auth:",
});

// GitHub redirects the browser here, not a user typing into a form, so the
// 5/15min strict limiter doesn't apply — but it's still a public endpoint
// worth capping against abuse (e.g. hammering it with junk state/code
// values).
/** Applied to /auth/github/callback only: 20 requests / 1 min per IP. */
export const githubCallbackLimiter = buildLimiter({
  windowMs: ONE_MINUTE_MS,
  max: 20,
  prefix: "rl:github-callback:",
});

// Defense in depth on top of listUserRepos' 60s Redis cache — the cache
// keeps repeated page loads from hitting GitHub, this keeps a single IP from
// hitting *us* too hard regardless.
/** Applied to GET /github/repos only: 30 requests / 1 min per IP. */
export const githubReposLimiter = buildLimiter({
  windowMs: ONE_MINUTE_MS,
  max: 30,
  prefix: "rl:github-repos:",
});

// Per-user (not per-IP) — expensive LLM calls, and IP-based limiting would
// let one user behind a shared/NAT'd IP rate-limit everyone else on it, or
// let one user bypass the limit entirely by switching IPs.
/** Applied to POST /chat/query only: 10 requests / 1 min per user. Must be
 * mounted after `authenticate` — its keyGenerator reads req.user. */
export const chatQueryLimiter = buildLimiter({
  windowMs: ONE_MINUTE_MS,
  max: 10,
  prefix: "rl:chat-query:",
  keyGenerator: (req) => req.user?.id ?? req.ip ?? "unknown",
});
