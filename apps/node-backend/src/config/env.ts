import "dotenv/config";
import { z } from "zod";

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  NODE_BACKEND_PORT: z.coerce.number().int().positive().optional(),
  PORT: z.coerce.number().int().positive().optional(),
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid Postgres connection string"),
  REDIS_URL: z.string().url("REDIS_URL must be a valid Redis connection string"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  INTERNAL_SERVICE_SECRET: z
    .string()
    .min(16, "INTERNAL_SERVICE_SECRET must be at least 16 characters"),
  ALLOWED_ORIGINS: z
    .string()
    .min(1, "ALLOWED_ORIGINS must be a comma-separated list of allowed origins (no wildcard)"),
  GITHUB_CLIENT_ID: z.string().min(1, "GITHUB_CLIENT_ID is required"),
  GITHUB_CLIENT_SECRET: z.string().min(1, "GITHUB_CLIENT_SECRET is required"),
});

const envSchema = rawEnvSchema.transform((data) => ({
  ...data,
  PORT: data.NODE_BACKEND_PORT ?? data.PORT ?? 4000,
  ALLOWED_ORIGINS: data.ALLOWED_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
}));

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error("Invalid environment configuration — refusing to start:");
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".") || "(root)";
      console.error(`  - ${path}: ${issue.message}`);
    }
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();
