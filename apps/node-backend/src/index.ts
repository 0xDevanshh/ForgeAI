import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { closeDbConnection } from "./services/db";
import { closeRedisConnection } from "./services/redisClient";

const server = app.listen(env.PORT, () => {
  logger.info(`node-backend listening on port ${env.PORT}`);
});

const SHUTDOWN_TIMEOUT_MS = 10_000;
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`Received ${signal}, starting graceful shutdown`);

  const forceExitTimer = setTimeout(() => {
    logger.error("Graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref();

  server.close(async (err) => {
    if (err) {
      logger.error({ err }, "Error while closing HTTP server");
    }

    try {
      await Promise.all([closeDbConnection(), closeRedisConnection()]);
      logger.info("Closed DB and Redis connections");
    } catch (cleanupErr) {
      logger.error({ err: cleanupErr }, "Error during connection cleanup");
    } finally {
      clearTimeout(forceExitTimer);
      process.exit(0);
    }
  });
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
