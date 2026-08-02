import { Router } from "express";
import { login, signup } from "../controllers/authController";
import { strictAuthLimiter } from "../middleware/rateLimiter";

export const authRouter = Router();

authRouter.post("/login", strictAuthLimiter, login);
authRouter.post("/signup", strictAuthLimiter, signup);
