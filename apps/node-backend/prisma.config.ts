import path from "node:path";
import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Env vars live in the monorepo root .env (shared with docker-compose's
// `env_file: .env`), not a package-local one — point dotenv at it explicitly
// since the CLI's cwd is this package directory.
config({ path: path.resolve(__dirname, "../../.env") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
