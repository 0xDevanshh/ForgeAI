import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import { fetchCommitDiff, fetchRecentCommits } from "../services/github.service";

const DEFAULT_COMMITS_LIMIT = 10;

async function findRepoOrThrow(id: string) {
  const repo = await prisma.repo.findUnique({ where: { id }, select: { userId: true, fullName: true } });
  if (!repo) {
    throw new AppError("Repo not found", 404);
  }
  return repo;
}

// repoAddSchema guarantees fullName is "owner/repo" at creation time (see
// repo.controller.ts:createRepo).
function splitFullName(fullName: string): [string, string] {
  const [owner, repo] = fullName.split("/");
  return [owner, repo];
}

// GET /internal/repos/:id/commits — called by ai-service's
// app/tools/github_context.py (fetch_recent_commits), never by end users.
export async function getRepoCommits(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const repo = await findRepoOrThrow(id);
  const [owner, repoName] = splitFullName(repo.fullName);

  const pathsParam = typeof req.query.paths === "string" ? req.query.paths : "";
  const filePaths = pathsParam
    .split(",")
    .map((path) => path.trim())
    .filter(Boolean);
  const limit = req.query.limit ? Number(req.query.limit) : DEFAULT_COMMITS_LIMIT;

  const commits = await fetchRecentCommits(repo.userId, owner, repoName, filePaths, limit);
  res.status(200).json({ commits });
}

// GET /internal/repos/:id/commits/:sha/diff — called by ai-service's
// app/tools/github_context.py (fetch_commit_diff), never by end users.
export async function getRepoCommitDiff(req: Request, res: Response): Promise<void> {
  const { id, sha } = req.params;
  const repo = await findRepoOrThrow(id);
  const [owner, repoName] = splitFullName(repo.fullName);

  const diff = await fetchCommitDiff(repo.userId, owner, repoName, sha);
  res.status(200).json({ diff });
}
