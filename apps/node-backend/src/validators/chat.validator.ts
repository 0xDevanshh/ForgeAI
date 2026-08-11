import { z } from "zod";

export const chatQuerySchema = z.object({
  query: z.string().min(1, "query is required"),
  repoId: z.string().min(1, "repoId is required"),
  chatSessionId: z.string().min(1, "chatSessionId is required"),
  chatHistory: z.array(z.record(z.unknown())).default([]),
});

export type ChatQueryInput = z.infer<typeof chatQuerySchema>;
