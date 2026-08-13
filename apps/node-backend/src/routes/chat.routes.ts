import { Router } from "express";
import {
  chatQuery,
  createChatSession,
  deleteChatSession,
  getChatMessages,
  listChatSessions,
} from "../controllers/chat.controller";
import { authenticate } from "../middleware/authenticate";
import { chatQueryLimiter } from "../middleware/rateLimiter";
import { validate } from "../middleware/validate";
import { chatQuerySchema, createChatSessionSchema } from "../validators/chat.validator";

export const chatRouter = Router();

chatRouter.get("/sessions", authenticate, listChatSessions);
chatRouter.post("/sessions", authenticate, validate(createChatSessionSchema), createChatSession);
chatRouter.get("/sessions/:id/messages", authenticate, getChatMessages);
chatRouter.delete("/sessions/:id", authenticate, deleteChatSession);

// authenticate before chatQueryLimiter — the limiter's keyGenerator reads req.user.
chatRouter.post("/query", authenticate, chatQueryLimiter, validate(chatQuerySchema), chatQuery);
