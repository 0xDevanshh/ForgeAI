import { randomBytes } from "node:crypto";
import { Octokit } from "@octokit/rest";
import { RequestError } from "@octokit/request-error";
import { env } from "../config/env";
import { decrypt } from "../lib/encryption";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { AppError, GithubRateLimitedError } from "../middleware/errorHandler";
import { redisClient } from "./redisClient";

const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";
const GITHUB_API_VERSION = "2022-11-28";
const USER_AGENT = "ai-codebase-copilot";

const STATE_KEY_PREFIX = "oauth:github:state:";
const STATE_TTL_SECONDS = 5 * 60;

// Single-use, short-lived CSRF token for the OAuth redirect round-trip:
// generated and stashed here keyed by the initiating user, then looked up
// (and deleted) once GitHub redirects back with it.
export async function createGithubOAuthState(userId: string): Promise<string> {
  const state = randomBytes(16).toString("hex");
  await redisClient.setex(`${STATE_KEY_PREFIX}${state}`, STATE_TTL_SECONDS, userId);
  return state;
}

// Returns the userId the state was issued for, or null if it's missing,
// expired, or already consumed. Deletes the key on any successful lookup so
// the same state value can never be redeemed twice.
export async function consumeGithubOAuthState(state: string): Promise<string | null> {
  const key = `${STATE_KEY_PREFIX}${state}`;
  const userId = await redisClient.get(key);

  if (userId) {
    await redisClient.del(key);
  }

  return userId;
}

interface GithubTokenSuccessResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

interface GithubTokenErrorResponse {
  error: string;
  error_description?: string;
}

export async function exchangeGithubCodeForAccessToken(code: string): Promise<string> {
  const res = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: env.GITHUB_CALLBACK_URL,
    }),
  });

  const body = (await res.json()) as GithubTokenSuccessResponse | GithubTokenErrorResponse;

  if (!res.ok || "error" in body) {
    const reason = "error" in body ? (body.error_description ?? body.error) : `HTTP ${res.status}`;
    throw new Error(`GitHub token exchange failed: ${reason}`);
  }

  return body.access_token;
}

// Every downstream call to the GitHub API should go through this rather than
// reading + decrypting githubAccessToken inline, so "not connected" is
// always a clean, catchable error instead of a null-reference crash deep in
// some repo-import/indexing code path.
export async function getDecryptedGithubToken(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubAccessToken: true },
  });

  if (!user?.githubAccessToken) {
    throw new AppError("GITHUB_NOT_CONNECTED", 400);
  }

  return decrypt(user.githubAccessToken);
}

// Matches the format app/services/repo_cloner.py's _build_authenticated_url
// expects on the ai-service side — clone_url arrives at ai-service with the
// token already embedded, so it never needs a separate token field.
export function buildAuthenticatedCloneUrl(fullName: string, token: string): string {
  return `https://x-access-token:${token}@github.com/${fullName}.git`;
}

export interface GithubUserProfile {
  username: string;
}

export async function fetchGithubUserProfile(accessToken: string): Promise<GithubUserProfile> {
  const res = await fetch(GITHUB_USER_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": USER_AGENT,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch GitHub user profile: HTTP ${res.status}`);
  }

  const body = (await res.json()) as { login?: unknown };

  if (typeof body.login !== "string" || body.login.length === 0) {
    throw new Error("GitHub user profile response is missing a login");
  }

  return { username: body.login };
}

const REPOS_CACHE_TTL_SECONDS = 60;
const RATE_LIMIT_WARNING_THRESHOLD = 100;
const DEFAULT_PER_PAGE = 30;

function reposCacheKey(userId: string, page: number): string {
  return `github:repos:${userId}:${page}`;
}

export interface GithubRepoSummary {
  githubRepoId: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  language: string | null;
  updatedAt: string;
}

export interface ListUserReposResult {
  repos: GithubRepoSummary[];
  pagination: {
    hasNextPage: boolean;
    nextPage: number | null;
  };
}

// GitHub's Link header looks like: <url>; rel="next", <url>; rel="last"
function linkHeaderHasNext(linkHeader: string | undefined): boolean {
  if (!linkHeader) return false;
  return linkHeader.split(",").some((part) => /rel="next"/.test(part));
}

// Converts a 403 into a clean 429 when it's actually GitHub's rate limit
// (primary: x-ratelimit-remaining hits 0, or secondary/abuse-detection:
// retry-after is set directly) — anything else is a genuine 403 and should
// propagate as-is rather than being misreported as a rate limit.
function toRateLimitError(err: unknown): GithubRateLimitedError | null {
  if (!(err instanceof RequestError) || err.status !== 403) {
    return null;
  }

  const headers = err.response?.headers ?? {};
  const retryAfterHeader = headers["retry-after"];
  if (retryAfterHeader) {
    return new GithubRateLimitedError(Number(retryAfterHeader));
  }

  const remaining = headers["x-ratelimit-remaining"];
  const reset = headers["x-ratelimit-reset"];
  if (remaining === "0" && reset) {
    const retryAfter = Math.max(0, Number(reset) - Math.floor(Date.now() / 1000));
    return new GithubRateLimitedError(retryAfter);
  }

  return null;
}

export async function listUserRepos(
  userId: string,
  page = 1,
  perPage = DEFAULT_PER_PAGE,
): Promise<ListUserReposResult> {
  const cacheKey = reposCacheKey(userId, page);
  const cached = await redisClient.get(cacheKey);

  if (cached) {
    return JSON.parse(cached) as ListUserReposResult;
  }

  const token = await getDecryptedGithubToken(userId);
  const octokit = new Octokit({ auth: token, userAgent: USER_AGENT });

  let response;
  try {
    response = await octokit.rest.repos.listForAuthenticatedUser({
      sort: "updated",
      per_page: perPage,
      page,
    });
  } catch (err) {
    const rateLimitError = toRateLimitError(err);
    if (rateLimitError) {
      logger.warn({ userId, retryAfter: rateLimitError.retryAfter }, "GitHub API rate limit exceeded");
      throw rateLimitError;
    }
    throw err;
  }

  const remaining = Number(response.headers["x-ratelimit-remaining"]);
  if (!Number.isNaN(remaining) && remaining < RATE_LIMIT_WARNING_THRESHOLD) {
    logger.warn(
      { userId, remaining, reset: response.headers["x-ratelimit-reset"] },
      "GitHub API rate limit running low",
    );
  }

  const hasNextPage = linkHeaderHasNext(response.headers.link);

  const result: ListUserReposResult = {
    repos: response.data.map((repo) => ({
      githubRepoId: String(repo.id),
      fullName: repo.full_name,
      private: repo.private,
      defaultBranch: repo.default_branch,
      language: repo.language ?? null,
      updatedAt: repo.updated_at ?? new Date(0).toISOString(),
    })),
    pagination: {
      hasNextPage,
      nextPage: hasNextPage ? page + 1 : null,
    },
  };

  await redisClient.setex(cacheKey, REPOS_CACHE_TTL_SECONDS, JSON.stringify(result));

  return result;
}

export interface GithubRepoDetails {
  githubRepoId: string;
  fullName: string;
  defaultBranch: string;
}

// Confirms a repo exists and the user actually has access to it, using
// *their* token — this is what makes it safe to trust the fullName/
// githubRepoId a client sends when registering a repo (POST /repos): if
// they don't have access, GitHub 404s and we never create the record.
export async function fetchGithubRepo(userId: string, owner: string, repo: string): Promise<GithubRepoDetails> {
  const token = await getDecryptedGithubToken(userId);
  const octokit = new Octokit({ auth: token, userAgent: USER_AGENT });

  let response;
  try {
    response = await octokit.rest.repos.get({ owner, repo });
  } catch (err) {
    const rateLimitError = toRateLimitError(err);
    if (rateLimitError) {
      logger.warn({ userId, retryAfter: rateLimitError.retryAfter }, "GitHub API rate limit exceeded");
      throw rateLimitError;
    }

    if (err instanceof RequestError && err.status === 404) {
      throw new AppError("GITHUB_REPO_NOT_FOUND", 404);
    }

    throw err;
  }

  return {
    githubRepoId: String(response.data.id),
    fullName: response.data.full_name,
    defaultBranch: response.data.default_branch,
  };
}

export interface CommitSummary {
  sha: string;
  message: string;
  author: string | null;
  date: string;
  filesChanged: string[];
}

const COMMITS_DEFAULT_LIMIT = 10;

// GitHub's list-commits endpoint only filters by a single `path`, but
// callers (ai-service's fetch_recent_commits) may want commits touching any
// of several files — so this queries once per path and merges by sha.
// filesChanged isn't in the list response (only in the single-commit
// response), so it's backfilled with one getCommit call per commit, but
// only for the final, already-limited set.
export async function fetchRecentCommits(
  userId: string,
  owner: string,
  repo: string,
  filePaths: string[],
  limit = COMMITS_DEFAULT_LIMIT,
): Promise<CommitSummary[]> {
  const token = await getDecryptedGithubToken(userId);
  const octokit = new Octokit({ auth: token, userAgent: USER_AGENT });

  const paths = filePaths.length > 0 ? filePaths : [undefined];
  const seen = new Map<string, { message: string; author: string | null; date: string }>();

  for (const path of paths) {
    let response;
    try {
      response = await octokit.rest.repos.listCommits({ owner, repo, path, per_page: limit });
    } catch (err) {
      const rateLimitError = toRateLimitError(err);
      if (rateLimitError) {
        logger.warn({ userId, retryAfter: rateLimitError.retryAfter }, "GitHub API rate limit exceeded");
        throw rateLimitError;
      }
      if (err instanceof RequestError && err.status === 404) {
        throw new AppError("GITHUB_REPO_NOT_FOUND", 404);
      }
      throw err;
    }

    for (const commit of response.data) {
      if (seen.has(commit.sha)) continue;
      seen.set(commit.sha, {
        message: commit.commit.message,
        author: commit.commit.author?.name ?? commit.author?.login ?? null,
        date: commit.commit.author?.date ?? new Date(0).toISOString(),
      });
    }
  }

  const topShas = [...seen.entries()].sort((a, b) => (a[1].date < b[1].date ? 1 : -1)).slice(0, limit);

  const commits: CommitSummary[] = [];
  for (const [sha, meta] of topShas) {
    let detail;
    try {
      detail = await octokit.rest.repos.getCommit({ owner, repo, ref: sha });
    } catch (err) {
      const rateLimitError = toRateLimitError(err);
      if (rateLimitError) {
        logger.warn({ userId, retryAfter: rateLimitError.retryAfter }, "GitHub API rate limit exceeded");
        throw rateLimitError;
      }
      throw err;
    }
    commits.push({
      sha,
      message: meta.message,
      author: meta.author,
      date: meta.date,
      filesChanged: (detail.data.files ?? []).map((f) => f.filename),
    });
  }

  return commits;
}

// Fetches a single commit's metadata (no diff), for ai-service's
// fetch_commit_metadata — used by the PR-summary agent, which needs one
// specific commit rather than a filtered/sorted list.
export async function fetchCommitMetadata(
  userId: string,
  owner: string,
  repo: string,
  sha: string,
): Promise<CommitSummary> {
  const token = await getDecryptedGithubToken(userId);
  const octokit = new Octokit({ auth: token, userAgent: USER_AGENT });

  let response;
  try {
    response = await octokit.rest.repos.getCommit({ owner, repo, ref: sha });
  } catch (err) {
    const rateLimitError = toRateLimitError(err);
    if (rateLimitError) {
      logger.warn({ userId, retryAfter: rateLimitError.retryAfter }, "GitHub API rate limit exceeded");
      throw rateLimitError;
    }
    if (err instanceof RequestError && err.status === 404) {
      throw new AppError("GITHUB_COMMIT_NOT_FOUND", 404);
    }
    throw err;
  }

  return {
    sha: response.data.sha,
    message: response.data.commit.message,
    author: response.data.commit.author?.name ?? response.data.author?.login ?? null,
    date: response.data.commit.author?.date ?? new Date(0).toISOString(),
    filesChanged: (response.data.files ?? []).map((f) => f.filename),
  };
}

// Fetches a single commit's raw unified diff, for ai-service's
// fetch_commit_diff. mediaType.format: "diff" makes Octokit set
// `Accept: application/vnd.github.v3.diff`, so GitHub returns the diff text
// directly instead of the default JSON commit object.
export async function fetchCommitDiff(userId: string, owner: string, repo: string, sha: string): Promise<string> {
  const token = await getDecryptedGithubToken(userId);
  const octokit = new Octokit({ auth: token, userAgent: USER_AGENT });

  let response;
  try {
    response = await octokit.rest.repos.getCommit({
      owner,
      repo,
      ref: sha,
      mediaType: { format: "diff" },
    });
  } catch (err) {
    const rateLimitError = toRateLimitError(err);
    if (rateLimitError) {
      logger.warn({ userId, retryAfter: rateLimitError.retryAfter }, "GitHub API rate limit exceeded");
      throw rateLimitError;
    }
    if (err instanceof RequestError && err.status === 404) {
      throw new AppError("GITHUB_COMMIT_NOT_FOUND", 404);
    }
    throw err;
  }

  // With mediaType.format: "diff", GitHub returns the raw diff as
  // response.data — Octokit's types still describe the default JSON shape
  // here, so this cast is deliberate, not an oversight.
  return response.data as unknown as string;
}
