import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { afterAll } from "vitest";

// Must happen before anything imports "../src/config/env", since that module
// reads process.env eagerly at import time.
process.env.NODE_ENV = "test";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(currentDir, "../../../.env") });

// Under ESM, static imports of a module execute before that module's own
// top-level code — so anything that transitively reads env vars via
// ../src/config/env has to be imported dynamically here, after the lines
// above have set them.
const { redisClient } = await import("../src/services/redisClient");
const { prisma } = await import("../src/lib/prisma");

// Rate limiting is bypassed entirely under NODE_ENV=test (see
// middleware/rateLimiter.ts), so nothing in this test run ever issues a
// Redis command. Disconnect immediately rather than let ioredis spend the
// whole run retrying a connection to a hostname ("redis") that only
// resolves inside the docker-compose network.
redisClient.disconnect();

afterAll(async () => {
  await prisma.$disconnect();
});
