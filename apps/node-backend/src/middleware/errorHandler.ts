import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import type { ApiErrorResponse, ValidationFieldError } from "../types/http";

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

// Thrown by the `validate` middleware. Kept as a distinct subclass rather than
// widening AppError's constructor, so every existing `new AppError(...)` call
// site is unaffected.
export class ValidationError extends AppError {
  public readonly details: ValidationFieldError[];

  constructor(details: ValidationFieldError[]) {
    super("VALIDATION_ERROR", 400);
    this.details = details;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

// Thrown by token.service when an access token's signature/shape is fine but
// it's simply expired — callers (e.g. a frontend auth interceptor) need to
// tell this apart from "not logged in at all" so they know to try a silent
// refresh instead of redirecting straight to the login page.
export class TokenExpiredError extends AppError {
  public readonly code = "TOKEN_EXPIRED" as const;

  constructor() {
    super("Access token has expired", 401);
    Object.setPrototypeOf(this, TokenExpiredError.prototype);
  }
}

// Thrown by github.service when GitHub's API itself reports the primary or
// secondary rate limit exceeded — this is the caller's fault for calling too
// often, not our server's fault, so it should surface as 429 with a
// Retry-After, not the generic 500 an unhandled Octokit error would produce.
export class GithubRateLimitedError extends AppError {
  public readonly retryAfter: number;

  constructor(retryAfter: number) {
    super("GITHUB_RATE_LIMITED", 429);
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, GithubRateLimitedError.prototype);
  }
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404));
}

// Must be registered last and take 4 params so Express recognizes it as an error handler.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const isOperational = isAppError ? err.isOperational : false;
  const error = err instanceof Error ? err : new Error("Unknown error");

  const log = req.log ?? logger;
  log.error({ err: error, statusCode, isOperational }, "Request error");

  const body: ApiErrorResponse = {
    error: isOperational ? error.message : "Internal Server Error",
  };

  if (err instanceof ValidationError) {
    body.details = err.details;
  }

  if (err instanceof TokenExpiredError) {
    body.code = err.code;
  }

  if (err instanceof GithubRateLimitedError) {
    res.setHeader("Retry-After", err.retryAfter);
    body.retryAfter = err.retryAfter;
  }

  if (env.NODE_ENV === "development") {
    body.stack = error.stack;
  }

  res.status(statusCode).json(body);
}
