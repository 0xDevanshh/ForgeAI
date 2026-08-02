import { Redis } from "ioredis";
import { env } from "../config/env";
import { logger } from "../lib/logger";

export const redisClient = new Redis(env.REDIS_URL);

redisClient.on("error", (err) => {
  logger.error({ err }, "Redis client error");
});

export async function checkRedisConnection(): Promise<boolean> {
  try {
    const pong = await redisClient.ping();
    return pong === "PONG";
  } catch (err) {
    logger.error({ err }, "Redis readiness check failed");
    return false;
  }
}

export async function closeRedisConnection(): Promise<void> {
  await redisClient.quit();
}
