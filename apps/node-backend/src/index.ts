import "express-async-errors";
import express from "express";
import { env } from "./config/env";
import { httpLogger, logger } from "./lib/logger";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { globalLimiter } from "./middleware/rateLimiter";
import { applySecurityMiddleware } from "./middleware/security";
import { authRouter } from "./routes/auth";
import { healthRouter } from "./routes/health";
import { closeDbConnection } from "./services/db";
import { closeRedisConnection } from "./services/redisClient";

const app = express();

applySecurityMiddleware(app);
app.use(httpLogger);
app.use(express.json());

// Mounted before globalLimiter so orchestrator health probes never count
// against the rate-limit budget, no matter how frequently they poll.
app.use("/health", healthRouter);

app.use(globalLimiter);
app.use("/auth", authRouter);

app.use(notFoundHandler);
app.use(errorHandler);

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
