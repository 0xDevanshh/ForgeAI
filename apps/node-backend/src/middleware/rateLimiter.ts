import type { Request, Response } from "express";
import rateLimit, { type RateLimitInfo, type RateLimitRequestHandler } from "express-rate-limit";
import { RedisStore, type RedisReply } from "rate-limit-redis";
import { redisClient } from "../services/redisClient";
import type { ApiErrorResponse } from "../types/http";

type RateLimitedRequest = Request & { rateLimit?: RateLimitInfo };

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

async function sendCommand(...args: string[]): Promise<RedisReply> {
  const [command, ...rest] = args;
  const result = await redisClient.call(command, rest);
  return result as RedisReply;
}

function buildLimiter(options: { windowMs: number; max: number; prefix: string }): RateLimitRequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true, // RateLimit-Limit / RateLimit-Remaining / RateLimit-Reset
    legacyHeaders: false, // no X-RateLimit-*
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
