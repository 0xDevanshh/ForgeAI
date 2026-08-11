import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { AppError } from "./errorHandler";

// Guards internal-only routes called by ai-service (mirrors ai-service's own
// verify_internal_key) — checks the same shared secret Node sends as
// X-Internal-Key via internalHttpClient, using a constant-time comparison so
// a mismatch can't be timed byte-by-byte to guess the secret.
export function verifyInternalKey(req: Request, _res: Response, next: NextFunction): void {
  const provided = Buffer.from(req.header("X-Internal-Key") ?? "");
  const expected = Buffer.from(env.INTERNAL_SERVICE_SECRET);

  const isValid = provided.length === expected.length && timingSafeEqual(provided, expected);

  if (!isValid) {
    throw new AppError("Invalid or missing internal service credentials", 401);
  }

  next();
}
