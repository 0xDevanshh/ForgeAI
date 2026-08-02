// Shared TypeScript types/interfaces used by node-backend and web.

export interface User {
  id: string;
  githubId: string;
  username: string;
  email: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

export interface Repository {
  id: string;
  ownerId: string;
  githubFullName: string;
  defaultBranch: string;
  indexedAt: string | null;
}

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  createdAt: string;
}

export interface CodeReference {
  repoId: string;
  filePath: string;
  startLine: number;
  endLine: number;
}

export interface AskRequest {
  conversationId: string;
  repoId: string;
  question: string;
}

export interface AskResponse {
  answer: string;
  references: CodeReference[];
}

export interface ApiError {
  message: string;
  code: string;
}
