import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { indexQueue } from "../lib/queue";
import { internalHttpClient } from "../lib/internalHttpClient";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import { buildAuthenticatedCloneUrl, fetchGithubRepo, getDecryptedGithubToken } from "../services/github.service";
import { redisClient } from "../services/redisClient";
import type { RepoAddInput } from "../validators/repo.validator";

function repoAlreadyExists(res: Response, repoId: string): void {
  res.status(409).json({ error: "REPO_ALREADY_EXISTS", repoId });
}

// Shared by createRepo and reindexRepo: builds the token-embedded clone URL,
// creates the IndexJob row, and enqueues the same job shape the worker
// expects (src/workers/indexWorker.ts). Returns the new IndexJob's id so the
// caller can hand it back to the frontend to subscribe to for progress.
async function enqueueRepoIndexJob(
  repoId: string,
  userId: string,
  fullName: string,
  defaultBranch: string,
): Promise<string> {
  const token = await getDecryptedGithubToken(userId);
  const cloneUrl = buildAuthenticatedCloneUrl(fullName, token);

  const indexJob = await prisma.indexJob.create({
    data: { repoId, status: "PENDING" },
  });

  await indexQueue.add("index-repo", {
    repoId,
    cloneUrl,
    branch: defaultBranch,
    indexJobId: indexJob.id,
  });

  return indexJob.id;
}

// POST /repos — requires authenticate.
export async function createRepo(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new AppError("Unauthorized", 401);
  }

  const { id: userId } = req.user;
  const { githubRepoId, fullName } = req.body as RepoAddInput;

  // Fast-path idempotency check on the client-supplied id, before paying for
  // a GitHub round trip. This is just an optimization/UX nicety — the real
  // duplicate guard is the @@unique constraint + the P2002 catch below.
  const existing = await prisma.repo.findUnique({
    where: { userId_githubRepoId: { userId, githubRepoId } },
  });

  if (existing) {
    repoAlreadyExists(res, existing.id);
    return;
  }

  // repoAddSchema guarantees fullName is "owner/repo".
  const [owner, repo] = fullName.split("/");

  // Confirms the repo exists and this user has access to it via their own
  // GitHub token — defends against a tampered fullName/githubRepoId in the
  // request body. Authoritative values from this response (not the body)
  // are what actually get stored.
  const githubRepo = await fetchGithubRepo(userId, owner, repo);

  let created;
  try {
    created = await prisma.repo.create({
      data: {
        userId,
        githubRepoId: githubRepo.githubRepoId,
        fullName: githubRepo.fullName,
        defaultBranch: githubRepo.defaultBranch,
        indexStatus: "PENDING",
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Race between the check above and this insert — the @@unique
      // constraint is the real source of truth.
      const raceExisting = await prisma.repo.findUnique({
        where: { userId_githubRepoId: { userId, githubRepoId: githubRepo.githubRepoId } },
      });
      if (raceExisting) {
        repoAlreadyExists(res, raceExisting.id);
        return;
      }
    }
    throw err;
  }

  const indexJobId = await enqueueRepoIndexJob(created.id, userId, created.fullName, created.defaultBranch);

  res.status(201).json({ ...created, indexJobId });
}

// GET /repos — requires authenticate.
export async function listMyRepos(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new AppError("Unauthorized", 401);
  }

  const repos = await prisma.repo.findMany({
    where: { userId: req.user.id },
    select: {
      id: true,
      fullName: true,
      indexStatus: true,
      lastIndexedAt: true,
      createdAt: true,
      // Language breakdown ({ [language]: fileCount }) and live job progress
      // are both needed to render a repo card without the client having to
      // fan out an extra request per repo.
      languages: true,
      indexJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { progress: true, errorMessage: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Flattened so the client sees a plain `progress`/`errorMessage` rather than
  // having to reach into a one-element array.
  const payload = repos.map(({ indexJobs, ...repo }) => ({
    ...repo,
    progress: indexJobs[0]?.progress ?? 0,
    errorMessage: indexJobs[0]?.errorMessage ?? null,
  }));

  res.status(200).json({ repos: payload });
}

// DELETE /repos/:id — requires authenticate.
export async function deleteRepo(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new AppError("Unauthorized", 401);
  }

  const { id } = req.params;
  const repo = await prisma.repo.findUnique({ where: { id } });

  // Same 404 whether the repo doesn't exist at all or exists but belongs to
  // someone else — a 403 would confirm to the caller that the id is real,
  // which is exactly the enumeration signal we don't want to hand out.
  if (!repo || repo.userId !== req.user.id) {
    throw new AppError("Repo not found", 404);
  }

  // onDelete: Cascade on IndexJob/ChatSession (see prisma/schema.prisma)
  // handles their cleanup.
  await prisma.repo.delete({ where: { id } });

  // Fire only after the Postgres delete has actually succeeded, and never
  // fail the request over this — an orphaned Qdrant collection is a minor
  // cleanup issue, not a user-facing failure. A periodic cleanup job can
  // reconcile leftover collections later if this turns out to matter.
  try {
    await internalHttpClient.delete(`/internal/collections/${id}`);
  } catch (err) {
    logger.warn({ err, repoId: id }, "Failed to delete Qdrant collection for repo after Postgres delete");
  }

  res.status(204).send();
}

const REINDEX_MAX_PER_HOUR = 3;
const REINDEX_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;

// POST /repos/:id/reindex — requires authenticate.
export async function reindexRepo(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new AppError("Unauthorized", 401);
  }

  const { id } = req.params;
  const repo = await prisma.repo.findUnique({ where: { id } });

  if (!repo || repo.userId !== req.user.id) {
    throw new AppError("Repo not found", 404);
  }

  // INCR-then-EXPIRE-once counter: cheap per-repo rate limit, distinct from
  // the generic IP-based limiters in middleware/rateLimiter.ts since this
  // needs to key on repoId, not the caller's IP.
  const rateLimitKey = `reindex:${id}`;
  const count = await redisClient.incr(rateLimitKey);
  if (count === 1) {
    await redisClient.expire(rateLimitKey, REINDEX_RATE_LIMIT_WINDOW_SECONDS);
  }

  if (count > REINDEX_MAX_PER_HOUR) {
    throw new AppError("Too many re-index requests for this repo — try again later", 429);
  }

  const indexJobId = await enqueueRepoIndexJob(repo.id, repo.userId, repo.fullName, repo.defaultBranch);

  await prisma.repo.update({ where: { id: repo.id }, data: { indexStatus: "PENDING" } });

  res.status(202).json({ repoId: repo.id, indexJobId });
}

// GET /repos/:id/index-status — requires authenticate.
export async function getIndexStatus(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new AppError("Unauthorized", 401);
  }

  const { id } = req.params;
  const repo = await prisma.repo.findUnique({
    where: { id },
    select: { userId: true, indexStatus: true },
  });

  if (!repo || repo.userId !== req.user.id) {
    throw new AppError("Repo not found", 404);
  }

  const latestJob = await prisma.indexJob.findFirst({
    where: { repoId: id },
    orderBy: { createdAt: "desc" },
    select: { progress: true, errorMessage: true },
  });

  res.status(200).json({
    indexStatus: repo.indexStatus,
    progress: latestJob?.progress ?? null,
    errorMessage: latestJob?.errorMessage ?? null,
  });
}
