import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import { fetchGithubRepo } from "../services/github.service";
import type { RepoAddInput } from "../validators/repo.validator";

function repoAlreadyExists(res: Response, repoId: string): void {
  res.status(409).json({ error: "REPO_ALREADY_EXISTS", repoId });
}

// POST /repos — requires authenticate.
//
// IMPORTANT: this only registers the repo (indexStatus: PENDING). It does
// NOT enqueue an indexing job — that's wired up in Step 5/6 via a BullMQ
// job that picks up PENDING repos. Nothing here starts cloning/parsing.
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

  res.status(201).json(created);
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
    },
    orderBy: { createdAt: "desc" },
  });

  res.status(200).json({ repos });
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

  res.status(204).send();
}
