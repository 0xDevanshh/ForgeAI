import { Pool } from "pg";
import { env } from "../config/env";
import { logger } from "../lib/logger";

export const pool = new Pool({ connectionString: env.DATABASE_URL });

pool.on("error", (err) => {
  logger.error({ err }, "Unexpected error on idle Postgres client");
});

export async function checkDbConnection(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch (err) {
    logger.error({ err }, "Postgres readiness check failed");
    return false;
  }
}

export async function closeDbConnection(): Promise<void> {
  await pool.end();
}
