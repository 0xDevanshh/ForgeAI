import { apiClient } from "@/lib/api-client";

export type IndexStatus =
  | "PENDING"
  | "CLONING"
  | "PARSING"
  | "EMBEDDING"
  | "COMPLETED"
  | "FAILED";

/** The in-flight statuses that render a determinate progress bar. */
export const ACTIVE_STATUSES: IndexStatus[] = ["CLONING", "PARSING", "EMBEDDING"];

export function isActive(status: IndexStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export interface Repo {
  id: string;
  fullName: string;
  indexStatus: IndexStatus;
  lastIndexedAt: string | null;
  createdAt: string;
  /** { [language]: fileCount }, written by the indexer. */
  languages: Record<string, number> | null;
  progress: number;
  errorMessage: string | null;
}

export interface GithubRepoSummary {
  githubRepoId: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  language: string | null;
  updatedAt: string;
}

export interface GithubReposPage {
  repos: GithubRepoSummary[];
  pagination: { hasNextPage: boolean; nextPage: number | null };
}

export const reposQueryKey = ["repos"] as const;
export const githubReposQueryKey = ["github-repos"] as const;

export async function fetchRepos(): Promise<Repo[]> {
  const { data } = await apiClient.get<{ repos: Repo[] }>("/repos");
  return data.repos;
}

export async function fetchGithubRepos(page: number): Promise<GithubReposPage> {
  const { data } = await apiClient.get<GithubReposPage>("/github/repos", { params: { page } });
  return data;
}

export async function addRepo(input: { githubRepoId: string; fullName: string }): Promise<Repo> {
  const { data } = await apiClient.post<Repo>("/repos", input);
  return data;
}

export async function reindexRepo(repoId: string): Promise<void> {
  await apiClient.post(`/repos/${repoId}/reindex`);
}

export async function removeRepo(repoId: string): Promise<void> {
  await apiClient.delete(`/repos/${repoId}`);
}

/** Top N languages by file count — the breakdown is unordered. */
export function topLanguages(
  languages: Record<string, number> | null,
  limit = 3
): string[] {
  if (!languages) return [];
  return Object.entries(languages)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([name]) => name);
}
