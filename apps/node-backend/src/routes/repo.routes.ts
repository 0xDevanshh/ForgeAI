import { Router } from "express";
import {
  createRepo,
  deleteRepo,
  getIndexStatus,
  listMyRepos,
  reindexRepo,
} from "../controllers/repo.controller";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { repoAddSchema } from "../validators/repo.validator";

export const repoRouter = Router();

repoRouter.post("/", authenticate, validate(repoAddSchema), createRepo);
repoRouter.get("/", authenticate, listMyRepos);
repoRouter.delete("/:id", authenticate, deleteRepo);
repoRouter.post("/:id/reindex", authenticate, reindexRepo);
repoRouter.get("/:id/index-status", authenticate, getIndexStatus);
