import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import type { ApiErrorResponse } from "../types/http";

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

  if (env.NODE_ENV === "development") {
    body.stack = error.stack;
  }

  res.status(statusCode).json(body);
}
