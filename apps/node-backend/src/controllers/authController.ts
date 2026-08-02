import type { Request, Response } from "express";
import { AppError } from "../middleware/errorHandler";

export function login(_req: Request, _res: Response): void {
  throw new AppError("Login is not implemented yet", 501);
}

export function signup(_req: Request, _res: Response): void {
  throw new AppError("Signup is not implemented yet", 501);
}
