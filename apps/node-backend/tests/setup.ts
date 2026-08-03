import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { afterAll } from "vitest";

// Must happen before anything imports "../src/config/env", since that module
// reads process.env eagerly at import time.
process.env.NODE_ENV = "test";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(currentDir, "../../../.env") });

// Some suites (github.test.ts) exercise real Redis-backed behavior — OAuth
// state storage, the repo-list cache — so, unlike rate limiting (bypassed
// entirely under NODE_ENV=test, see middleware/rateLimiter.ts), Redis itself
// needs to actually work here. Point it at a dedicated logical DB (15) on
// whatever Redis is already running locally, rather than the docker-compose
// hostname ("redis") from .env, which only resolves inside that network.
// DB 15 is flushed (not the whole instance) in afterAll, so this can never
// touch real data sitting in DB 0. Requires a Redis reachable at
// 127.0.0.1:6379 — e.g. `brew services start redis` or `redis-server`.
process.env.REDIS_URL = "redis://127.0.0.1:6379/15";

// Under ESM, static imports of a module execute before that module's own
// top-level code — so anything that transitively reads env vars via
// ../src/config/env has to be imported dynamically here, after the lines
// above have set them.
const { redisClient } = await import("../src/services/redisClient");
const { prisma } = await import("../src/lib/prisma");

afterAll(async () => {
  await redisClient.flushdb();
  redisClient.disconnect();
  await prisma.$disconnect();
});
