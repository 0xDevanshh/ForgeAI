import type { Request, Response } from "express";
import type { Readable } from "node:stream";
import { internalHttpClient } from "../lib/internalHttpClient";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { emitToUser } from "../lib/socket";
import { AppError } from "../middleware/errorHandler";
import type { ChatQueryInput, CreateChatSessionInput } from "../validators/chat.validator";

// Generous — a full planner -> agent -> reviewer graph run can take a
// while, same reasoning as the other long-running internalHttpClient calls.
const QUERY_TIMEOUT_MS = 5 * 60 * 1000;

interface QuerySseEvent {
  node: string;
  data?: Record<string, unknown>;
}

interface QueryOutcome {
  content: string | null;
  intent: string | null;
  /** null when the graph never flagged the answer (i.e. review passed). */
  reviewerApproved: boolean | null;
  reviewerNotes: string[];
  /** How many times the reviewer sent the answer back to be regenerated. */
  regenerationCount: number;
}

/**
 * ai-service normally sets generated_response to a plain string. When the
 * reviewer rejects an answer up to the retry cap, architecture_agent's
 * attach_incomplete_flag replaces it with
 * { response, reviewer_approved: false, reviewer_notes: [...] } instead.
 *
 * Both shapes have to be understood here: treating only the string case as
 * valid made every thrice-rejected answer fall through to the "did not produce
 * a response" 502 below — losing exactly the answer the UI is meant to show
 * with a "may be incomplete" warning.
 */
function readGeneratedResponse(value: unknown, outcome: QueryOutcome): void {
  if (typeof value === "string") {
    outcome.content = value;
    return;
  }

  if (value && typeof value === "object") {
    const flagged = value as Record<string, unknown>;
    if (typeof flagged.response === "string") {
      outcome.content = flagged.response;
    }
    if (typeof flagged.reviewer_approved === "boolean") {
      outcome.reviewerApproved = flagged.reviewer_approved;
    }
    if (Array.isArray(flagged.reviewer_notes)) {
      outcome.reviewerNotes = flagged.reviewer_notes.filter(
        (note): note is string => typeof note === "string",
      );
    }
  }
}

// Consumes ai-service's SSE stream, re-emitting each frame to the user over
// Socket.IO as it arrives, and tracking whatever the graph's most recent
// generated_response/intent were — deliberately not tied to a specific node
// name, since which node sets these fields depends on the routed intent.
async function consumeQueryStream(stream: Readable, userId: string): Promise<QueryOutcome> {
  let buffer = "";
  const outcome: QueryOutcome = {
    content: null,
    intent: null,
    reviewerApproved: null,
    reviewerNotes: [],
    regenerationCount: 0,
  };

  await new Promise<void>((resolve, reject) => {
    stream.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary).trim();
        buffer = buffer.slice(boundary + 2);

        if (frame.startsWith("data:")) {
          const jsonStr = frame.slice("data:".length).trim();

          try {
            const parsedEvent = JSON.parse(jsonStr) as QuerySseEvent;
            emitToUser(userId, "queryProgress", parsedEvent);

            const data = parsedEvent.data;
            if (data) {
              if ("generated_response" in data) {
                readGeneratedResponse(data.generated_response, outcome);
              }
              if (typeof data.intent === "string") {
                outcome.intent = data.intent;
              }
              if (typeof data.regeneration_count === "number") {
                outcome.regenerationCount = data.regeneration_count;
              }
              // The reviewer's own verdict is the authority when the answer
              // was never flagged (i.e. it passed on some attempt).
              const verdict = data.reviewer_verdict as Record<string, unknown> | undefined;
              if (verdict && typeof verdict.approved === "boolean") {
                outcome.reviewerApproved = verdict.approved;
              }
            }
          } catch (err) {
            logger.warn({ err, jsonStr }, "Failed to parse SSE event from ai-service /query");
          }
        }

        boundary = buffer.indexOf("\n\n");
      }
    });

    stream.on("end", () => resolve());
    stream.on("error", (err) => reject(err));
  });

  return outcome;
}

/** Shared ownership guard — never trust a session id from the client. */
async function findOwnedSession(chatSessionId: string, userId: string) {
  const chatSession = await prisma.chatSession.findUnique({ where: { id: chatSessionId } });
  if (!chatSession || chatSession.userId !== userId) {
    throw new AppError("Chat session not found", 404);
  }
  return chatSession;
}

async function findOwnedRepo(repoId: string, userId: string) {
  const repo = await prisma.repo.findUnique({ where: { id: repoId } });
  if (!repo || repo.userId !== userId) {
    throw new AppError("Repo not found", 404);
  }
  return repo;
}

// GET /chat/sessions[?repoId=...] — requires authenticate.
//
// Without repoId this returns every conversation the user has, across repos,
// which is what the cross-repo /chat screen lists. With it, the set is scoped
// to that repo (and ownership of the repo itself is checked).
export async function listChatSessions(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError("Unauthorized", 401);

  const repoId = typeof req.query.repoId === "string" ? req.query.repoId : null;
  if (repoId) {
    await findOwnedRepo(repoId, req.user.id);
  }

  const sessions = await prisma.chatSession.findMany({
    where: { userId: req.user.id, ...(repoId ? { repoId } : {}) },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      // Needed to label a conversation when the list spans repos.
      repo: { select: { id: true, fullName: true } },
      _count: { select: { messages: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  res.status(200).json({
    sessions: sessions.map(({ _count, ...session }) => ({
      ...session,
      messageCount: _count.messages,
    })),
  });
}

// POST /chat/sessions — requires authenticate.
export async function createChatSession(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError("Unauthorized", 401);

  const { repoId } = req.body as CreateChatSessionInput;
  await findOwnedRepo(repoId, req.user.id);

  const session = await prisma.chatSession.create({
    data: { userId: req.user.id, repoId },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });

  res.status(201).json({ session: { ...session, messageCount: 0 } });
}

// GET /chat/sessions/:id/messages — requires authenticate.
export async function getChatMessages(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError("Unauthorized", 401);

  const { id } = req.params;
  await findOwnedSession(id, req.user.id);

  const messages = await prisma.message.findMany({
    where: { chatSessionId: id },
    select: {
      id: true,
      role: true,
      content: true,
      agentType: true,
      reviewerVerdict: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  res.status(200).json({ messages });
}

// DELETE /chat/sessions/:id — requires authenticate.
export async function deleteChatSession(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError("Unauthorized", 401);

  const { id } = req.params;
  await findOwnedSession(id, req.user.id);

  await prisma.chatSession.delete({ where: { id } });
  res.status(204).send();
}

// POST /chat/query — requires authenticate.
export async function chatQuery(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new AppError("Unauthorized", 401);
  }

  const { id: userId } = req.user;
  const { query, repoId, chatSessionId, chatHistory } = req.body as ChatQueryInput;

  // Never trust repoId/chatSessionId from the client without checking
  // ownership — otherwise an authenticated user could query someone else's
  // private repo's embedded code, or append messages to a chat session that
  // isn't theirs.
  const [repo, chatSession] = await Promise.all([
    prisma.repo.findUnique({ where: { id: repoId } }),
    prisma.chatSession.findUnique({ where: { id: chatSessionId } }),
  ]);

  if (!repo || repo.userId !== userId) {
    throw new AppError("Repo not found", 404);
  }
  if (!chatSession || chatSession.userId !== userId) {
    throw new AppError("Chat session not found", 404);
  }

  // Persisted before the graph runs, so a question survives a failed or
  // timed-out answer instead of leaving the thread with replies and no
  // prompts after a reload.
  await prisma.message.create({
    data: { chatSessionId, role: "USER", content: query },
  });

  // First question doubles as the session's title, which is what the session
  // switcher lists.
  if (!chatSession.title) {
    await prisma.chatSession.update({
      where: { id: chatSessionId },
      data: { title: query.slice(0, 120) },
    });
  }

  const response = await internalHttpClient.post(
    "/query",
    { query, repo_id: repoId, chat_session_id: chatSessionId, chat_history: chatHistory },
    { responseType: "stream", timeout: QUERY_TIMEOUT_MS },
  );

  const outcome = await consumeQueryStream(response.data as Readable, userId);

  if (outcome.content === null) {
    throw new AppError("Query did not produce a response", 502);
  }

  const message = await prisma.message.create({
    data: {
      chatSessionId,
      role: "ASSISTANT",
      content: outcome.content,
      agentType: outcome.intent,
      reviewerVerdict: {
        approved: outcome.reviewerApproved ?? true,
        notes: outcome.reviewerNotes,
        regenerationCount: outcome.regenerationCount,
      },
    },
    select: { id: true, role: true, content: true, agentType: true, reviewerVerdict: true, createdAt: true },
  });

  // Bumps updatedAt so the switcher's most-recent ordering stays accurate.
  await prisma.chatSession.update({ where: { id: chatSessionId }, data: { updatedAt: new Date() } });

  res.status(200).json({ status: "completed", message });
}
