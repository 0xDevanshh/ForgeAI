import { Router } from "express";
import { chatQuery } from "../controllers/chat.controller";
import { authenticate } from "../middleware/authenticate";
import { chatQueryLimiter } from "../middleware/rateLimiter";
import { validate } from "../middleware/validate";
import { chatQuerySchema } from "../validators/chat.validator";

export const chatRouter = Router();

// authenticate before chatQueryLimiter — the limiter's keyGenerator reads req.user.
chatRouter.post("/query", authenticate, chatQueryLimiter, validate(chatQuerySchema), chatQuery);
