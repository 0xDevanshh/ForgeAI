import type { Request, Response } from "express";
import { internalHttpClient } from "../lib/internalHttpClient";
import { checkDbConnection } from "../services/db";
import { checkRedisConnection } from "../services/redisClient";

const AI_SERVICE_HEALTH_CHECK_TIMEOUT_MS = 3_000;

// Plain reachability ping — ai-service's /health/* routes are excluded from
// its internal-key check, so it doesn't matter that internalHttpClient
// still attaches X-Internal-Key here. A short timeout keeps a down/hanging
// AI service from making our own readiness probe slow.
async function checkAiServiceReachable(): Promise<boolean> {
  try {
    await internalHttpClient.get("/health/live", { timeout: AI_SERVICE_HEALTH_CHECK_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

export function liveness(_req: Request, res: Response): void {
  res.status(200).json({ status: "ok" });
}

export async function readiness(_req: Request, res: Response): Promise<void> {
  const [dbOk, redisOk, aiServiceReachable] = await Promise.all([
    checkDbConnection(),
    checkRedisConnection(),
    checkAiServiceReachable(),
  ]);

  // Node's own readiness is db+redis only — the AI service being down is a
  // dependency problem worth surfacing, not a reason to report Node itself
  // as unready.
  const ready = dbOk && redisOk;

  res.status(ready ? 200 : 503).json({
    status: ready ? "ok" : "unavailable",
    db: dbOk ? "up" : "down",
    redis: redisOk ? "up" : "down",
    aiServiceReachable,
  });
}
