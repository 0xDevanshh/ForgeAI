import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../services/token.service";
import { AppError } from "./errorHandler";

const BEARER_PREFIX = "Bearer ";

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith(BEARER_PREFIX)) {
    throw new AppError("Missing or invalid Authorization header", 401);
  }

  const token = header.slice(BEARER_PREFIX.length);
  const payload = verifyAccessToken(token);

  req.user = { id: payload.sub, email: payload.email };
  next();
}
