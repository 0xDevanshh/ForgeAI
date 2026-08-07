import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { closeQueueConnections } from "./lib/queue";
import { closeSocketServer, initSocketServer } from "./lib/socket";
import { closeDbConnection } from "./services/db";
import { closeRedisConnection } from "./services/redisClient";
import { startIndexWorker } from "./workers/indexWorker";

const server = app.listen(env.PORT, () => {
  logger.info(`node-backend listening on port ${env.PORT}`);
});

initSocketServer(server);

// Runs in the same process as the Express app — no separate entry
// point/process needed for now.
const worker = startIndexWorker();

const WORKER_CLOSE_TIMEOUT_MS = 30_000;
// Must exceed WORKER_CLOSE_TIMEOUT_MS: this is the last-resort safety net
// for the whole shutdown sequence (worker close + DB/Redis/queue close), not
// just the worker.
const SHUTDOWN_TIMEOUT_MS = 35_000;
let shuttingDown = false;

// worker.close() itself has no built-in timeout — it waits for active jobs
// to finish (or hit their own job-level timeout) before resolving. Race it
// against a manual timer, same pattern as the HTTP server's own shutdown
// timeout below, so one stuck job can't block shutdown indefinitely.
async function closeWorkerWithTimeout(): Promise<void> {
  await Promise.race([
    worker.close(),
    new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        logger.warn(`Worker close timed out after ${WORKER_CLOSE_TIMEOUT_MS}ms, continuing shutdown`);
        resolve();
      }, WORKER_CLOSE_TIMEOUT_MS);
      timer.unref();
    }),
  ]);
}

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
      // Let any in-flight indexing job finish (or hit its own timeout)
      // before closing the connections it depends on.
      await closeWorkerWithTimeout();
      await Promise.all([
        closeDbConnection(),
        closeRedisConnection(),
        closeQueueConnections(),
        closeSocketServer(),
      ]);
      logger.info("Closed DB, Redis, queue, and socket connections");
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
