import { Router } from "express";
import { login, logout, me, refresh, signup } from "../controllers/auth.controller";
import { authenticate } from "../middleware/authenticate";
import { strictAuthLimiter } from "../middleware/rateLimiter";
import { validate } from "../middleware/validate";
import { loginSchema, signupSchema } from "../validators/auth.validator";

export const authRouter = Router();

authRouter.post("/signup", strictAuthLimiter, validate(signupSchema), signup);
authRouter.post("/login", strictAuthLimiter, validate(loginSchema), login);
authRouter.post("/refresh", refresh);
authRouter.post("/logout", authenticate, logout);
authRouter.get("/me", authenticate, me);
