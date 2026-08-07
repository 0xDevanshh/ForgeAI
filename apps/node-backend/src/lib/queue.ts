import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../config/env";

// BullMQ requires its own dedicated ioredis connection with
// maxRetriesPerRequest: null (a hard BullMQ requirement) — incompatible
// with services/redisClient.ts's generic caching/rate-limit client, which
// relies on ioredis's normal retry behavior. Shared by the Queue here and
// the Worker in workers/indexWorker.ts.
export const queueConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const indexQueue = new Queue("repo-indexing", {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 },
  },
});

// BullMQ only closes connections it creates itself internally — since this
// one was supplied externally, closing it is our responsibility. Call after
// the Worker has already been closed (see index.ts's shutdown sequence),
// since the Worker uses this same connection.
export async function closeQueueConnections(): Promise<void> {
  await indexQueue.close();
  await queueConnection.quit();
}
