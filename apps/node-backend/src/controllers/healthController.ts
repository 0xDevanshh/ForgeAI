import type { Request, Response } from "express";
import { checkDbConnection } from "../services/db";
import { checkRedisConnection } from "../services/redisClient";

export function liveness(_req: Request, res: Response): void {
  res.status(200).json({ status: "ok" });
}

export async function readiness(_req: Request, res: Response): Promise<void> {
  const [dbOk, redisOk] = await Promise.all([checkDbConnection(), checkRedisConnection()]);
  const ready = dbOk && redisOk;

  res.status(ready ? 200 : 503).json({
    status: ready ? "ok" : "unavailable",
    db: dbOk ? "up" : "down",
    redis: redisOk ? "up" : "down",
  });
}
