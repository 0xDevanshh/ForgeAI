import "express-async-errors";
import cookieParser from "cookie-parser";
import express from "express";
import { httpLogger } from "./lib/logger";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { globalLimiter } from "./middleware/rateLimiter";
import { applySecurityMiddleware } from "./middleware/security";
import { authRouter } from "./routes/auth.routes";
import { healthRouter } from "./routes/health";

export const app = express();

applySecurityMiddleware(app);
app.use(httpLogger);
app.use(express.json());
app.use(cookieParser());

// Mounted before globalLimiter so orchestrator health probes never count
// against the rate-limit budget, no matter how frequently they poll.
app.use("/health", healthRouter);

app.use(globalLimiter);
app.use("/auth", authRouter);

app.use(notFoundHandler);
app.use(errorHandler);
