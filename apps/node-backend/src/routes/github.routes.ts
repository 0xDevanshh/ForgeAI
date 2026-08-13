import { Router } from "express";
import { callback, connect, disconnect, listRepos } from "../controllers/github.controller";
import { authenticate } from "../middleware/authenticate";
import { authenticateNavigation } from "../middleware/authenticateNavigation";
import { githubCallbackLimiter, githubReposLimiter } from "../middleware/rateLimiter";

// Mounted at /auth/github — account-linking OAuth flow.
export const githubRouter = Router();

// The browser arrives here by top-level navigation (this 302s to GitHub), so
// it can't send an Authorization header — see authenticateNavigation.
githubRouter.get("/connect", authenticateNavigation, connect);
githubRouter.get("/callback", githubCallbackLimiter, callback);
githubRouter.post("/disconnect", authenticate, disconnect);

// Mounted at /github — GitHub data operations for an already-connected account.
export const githubReposRouter = Router();

githubReposRouter.get("/repos", authenticate, githubReposLimiter, listRepos);
