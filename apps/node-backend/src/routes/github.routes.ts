import { Router } from "express";
import { callback, connect, disconnect, listRepos } from "../controllers/github.controller";
import { authenticate } from "../middleware/authenticate";
import { githubCallbackLimiter, githubReposLimiter } from "../middleware/rateLimiter";

// Mounted at /auth/github — account-linking OAuth flow.
export const githubRouter = Router();

githubRouter.get("/connect", authenticate, connect);
githubRouter.get("/callback", githubCallbackLimiter, callback);
githubRouter.post("/disconnect", authenticate, disconnect);

// Mounted at /github — GitHub data operations for an already-connected account.
export const githubReposRouter = Router();

githubReposRouter.get("/repos", authenticate, githubReposLimiter, listRepos);
