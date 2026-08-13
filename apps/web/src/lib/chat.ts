import { apiClient } from "@/lib/api-client";

export type AgentType =
  | "architecture"
  | "bug_investigation"
  | "pr_summary"
  | "documentation";

export interface ReviewerVerdict {
  approved: boolean;
  notes: string[];
  regenerationCount: number;
}

export interface ChatMessage {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  agentType: AgentType | null;
  reviewerVerdict: ReviewerVerdict | null;
  createdAt: string;
  /** Set on locally-appended messages that the server hasn't confirmed yet. */
  pending?: boolean;
}

export interface ChatSession {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  /** Which repo the conversation belongs to — needed when listing across repos. */
  repo: { id: string; fullName: string };
}

// A null repoId is the cross-repo list on /chat; a real one scopes to a repo.
export const sessionsQueryKey = (repoId: string | null) => ["chat-sessions", repoId] as const;
export const messagesQueryKey = (sessionId: string) => ["chat-messages", sessionId] as const;

export async function fetchSessions(repoId?: string | null): Promise<ChatSession[]> {
  const { data } = await apiClient.get<{ sessions: ChatSession[] }>("/chat/sessions", {
    params: repoId ? { repoId } : undefined,
  });
  return data.sessions;
}

export async function createSession(repoId: string): Promise<ChatSession> {
  const { data } = await apiClient.post<{ session: ChatSession }>("/chat/sessions", { repoId });
  return data.session;
}

export async function fetchMessages(sessionId: string): Promise<ChatMessage[]> {
  const { data } = await apiClient.get<{ messages: ChatMessage[] }>(
    `/chat/sessions/${sessionId}/messages`
  );
  return data.messages;
}

export interface ChatQueryResult {
  status: string;
  message: ChatMessage;
}

export async function sendQuery(input: {
  query: string;
  repoId: string;
  chatSessionId: string;
  chatHistory: { role: string; content: string }[];
}): Promise<ChatQueryResult> {
  const { data } = await apiClient.post<ChatQueryResult>("/chat/query", input);
  return data;
}

export const AGENT_LABELS: Record<AgentType, string> = {
  architecture: "architecture",
  bug_investigation: "bug_investigation",
  pr_summary: "pr_summary",
  documentation: "documentation",
};

export const AGENT_TAG_CLASS: Record<AgentType, string> = {
  architecture: "agent-tag--architecture",
  bug_investigation: "agent-tag--bug-investigation",
  pr_summary: "agent-tag--pr-summary",
  documentation: "agent-tag--documentation",
};

/** Left accent border on the assistant block, matching the agent's tag. */
export const AGENT_BORDER_CLASS: Record<AgentType, string> = {
  architecture: "border-l-agent-architecture",
  bug_investigation: "border-l-agent-bug",
  pr_summary: "border-l-agent-pr",
  documentation: "border-l-agent-docs",
};

export function isAgentType(value: unknown): value is AgentType {
  return (
    value === "architecture" ||
    value === "bug_investigation" ||
    value === "pr_summary" ||
    value === "documentation"
  );
}
