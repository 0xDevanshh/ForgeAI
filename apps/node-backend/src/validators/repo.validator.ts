import { z } from "zod";

export const repoAddSchema = z.object({
  githubRepoId: z.string().min(1, "githubRepoId is required"),
  fullName: z.string().regex(/^[^/\s]+\/[^/\s]+$/, 'fullName must be in the form "owner/repo"'),
});

export type RepoAddInput = z.infer<typeof repoAddSchema>;
