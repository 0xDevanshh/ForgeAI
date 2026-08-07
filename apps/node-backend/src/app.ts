import "express-async-errors";
import cookieParser from "cookie-parser";
import express from "express";
import { httpLogger } from "./lib/logger";
import { runWithRequestContext } from "./lib/requestContext";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { globalLimiter } from "./middleware/rateLimiter";
import { applySecurityMiddleware } from "./middleware/security";
import { authRouter } from "./routes/auth.routes";
import { githubReposRouter, githubRouter } from "./routes/github.routes";
import { healthRouter } from "./routes/health";
import { internalTestRouter } from "./routes/internalTest.routes";
import { repoRouter } from "./routes/repo.routes";

export const app = express();

applySecurityMiddleware(app);
app.use(httpLogger);
app.use(express.json());
app.use(cookieParser());

// Makes the current request's id (set by pino-http just above) available to
// internalHttpClient's interceptor without threading it through every call
// site manually — anything called during this request, however deep, can
// read it back via getCurrentRequestId().
app.use((req, _res, next) => {
  runWithRequestContext(String(req.id), next);
});

// Mounted before globalLimiter so orchestrator health probes never count
// against the rate-limit budget, no matter how frequently they poll.
app.use("/health", healthRouter);
app.use("/internal-test", internalTestRouter);

app.use(globalLimiter);
app.use("/auth", authRouter);
app.use("/auth/github", githubRouter);
app.use("/github", githubReposRouter);
app.use("/repos", repoRouter);

app.use(notFoundHandler);
app.use(errorHandler);
