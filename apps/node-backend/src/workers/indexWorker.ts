import { Job, Worker } from "bullmq";
import { logger } from "../lib/logger";
import { queueConnection } from "../lib/queue";
import { emitToUser } from "../lib/socket";
import { prisma } from "../lib/prisma";
import { internalHttpClient } from "../lib/internalHttpClient";
import { AppError } from "../middleware/errorHandler";

function indexProgressEvent(repoId: string): string {
  return `indexProgress:${repoId}`;
}

const CONCURRENCY = 2;

// 5 minutes — parsing a big repo can take a while; this is a per-call
// override of internalHttpClient's normal 30s default, not a change to it.
const AI_SERVICE_PARSE_TIMEOUT_MS = 5 * 60 * 1000;

interface IndexJobData {
  repoId: string;
  cloneUrl: string;
  branch: string;
  indexJobId: string;
}

interface ParseRepoAiResponse {
  analysis: {
    file_count: number;
    languages: Record<string, number>;
    frameworks: string[];
    folder_structure: Record<string, unknown>;
  };
  chunks: unknown[];
  chunk_count: number;
}

// internalHttpClient's own response interceptor already replaces any
// ai-service error body with a generic AppError message (see
// lib/internalHttpClient.ts) — so an AppError's .message is already safe to
// store as-is. Anything else (e.g. a Prisma error) gets a fully generic
// fallback rather than leaking a raw stack/driver message to the user.
function sanitizeErrorMessage(err: unknown): string {
  if (err instanceof AppError) {
    return err.message;
  }
  return "An unexpected error occurred while indexing this repository.";
}

async function markJobFailedPermanently(
  indexJobId: string,
  repoId: string,
  userId: string,
  message: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.indexJob.update({
      where: { id: indexJobId },
      data: { status: "FAILED", errorMessage: message, completedAt: new Date() },
    }),
    prisma.repo.update({
      where: { id: repoId },
      data: { indexStatus: "FAILED" },
    }),
  ]);

  emitToUser(userId, indexProgressEvent(repoId), { status: "FAILED", error: message });
}

async function processIndexJob(job: Job<IndexJobData>): Promise<void> {
  const { repoId, cloneUrl, branch, indexJobId } = job.data;

  const repo = await prisma.repo.findUniqueOrThrow({
    where: { id: repoId },
    select: { userId: true },
  });
  const { userId } = repo;

  try {
    // 1. CLONING
    await prisma.indexJob.update({
      where: { id: indexJobId },
      data: { status: "CLONING", progress: 10, startedAt: new Date() },
    });
    await prisma.repo.update({ where: { id: repoId }, data: { indexStatus: "CLONING" } });
    emitToUser(userId, indexProgressEvent(repoId), { status: "CLONING", progress: 10 });

    // 2. hand off to ai-service for the actual clone + parse
    const response = await internalHttpClient.post<ParseRepoAiResponse>(
      "/internal/parse-repo",
      { repo_id: repoId, clone_url: cloneUrl, branch, job_id: indexJobId },
      { timeout: AI_SERVICE_PARSE_TIMEOUT_MS },
    );

    const { analysis, chunk_count: chunkCount } = response.data;

    // 3. success: PARSING
    await prisma.repo.update({
      where: { id: repoId },
      data: {
        languages: analysis.languages,
        frameworks: analysis.frameworks,
        fileCount: analysis.file_count,
        indexStatus: "PARSING",
      },
    });

    await prisma.indexJob.update({
      where: { id: indexJobId },
      data: { status: "PARSING", progress: 40, chunkCount },
    });

    emitToUser(userId, indexProgressEvent(repoId), { status: "PARSING", progress: 40, chunkCount });

    logger.info({ jobId: job.id, repoId, indexJobId, chunkCount }, "parse-repo stage completed");

    // Chunks themselves get passed to Step 7's embedding stage — Step 6
    // scope stops here; that work extends this same handler.
  } catch (err) {
    const maxAttempts = job.opts.attempts ?? 1;
    // Inside the processor, job.attemptsMade counts attempts completed
    // *before* this one (0 on the first attempt, 1 on the second) — it
    // only reaches maxAttempts as observed from outside (e.g. the worker's
    // "failed" event), never from in here. The attempt currently running
    // is attemptsMade + 1; verified empirically since this is an easy
    // off-by-one to get wrong and silently never mark a job failed.
    const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts;

    // Only mark the job/repo user-facing FAILED once we're sure no retry is
    // coming — otherwise the UI would flash "failed" on attempt 1 of 3, then
    // flip back to "cloning" when the retry starts, which is more confusing
    // than just not updating it yet.
    if (isFinalAttempt) {
      await markJobFailedPermanently(indexJobId, repoId, userId, sanitizeErrorMessage(err));
    }

    logger.error(
      { jobId: job.id, repoId, indexJobId, attemptsMade: job.attemptsMade, maxAttempts, err },
      "repo indexing attempt failed",
    );

    // Always rethrow — BullMQ's own attempt/backoff bookkeeping (and the
    // queue-level "failed" event) needs to see every failure, final or not.
    throw err;
  }
}

export function startIndexWorker(): Worker {
  const worker = new Worker("repo-indexing", processIndexJob, {
    connection: queueConnection,
    concurrency: CONCURRENCY,
  });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "repo-indexing job completed");
  });

  // Primary debugging surface when indexing breaks — fires on every failed
  // attempt (not just the final one), with the full job data so a bad
  // clone_url/branch or a specific repo is immediately visible in the logs.
  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, data: job?.data, attemptsMade: job?.attemptsMade, err }, "repo-indexing job failed");
  });

  worker.on("error", (err) => {
    logger.error({ err }, "repo-indexing worker error");
  });

  logger.info(`Index worker started (concurrency=${CONCURRENCY})`);

  return worker;
}
