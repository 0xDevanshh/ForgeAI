import { Router } from "express";
import { getRepoCommitDiff, getRepoCommits } from "../controllers/internalRepo.controller";
import { verifyInternalKey } from "../middleware/internalAuth";

export const internalRepoRouter = Router();

internalRepoRouter.get("/:id/commits", verifyInternalKey, getRepoCommits);
internalRepoRouter.get("/:id/commits/:sha/diff", verifyInternalKey, getRepoCommitDiff);
