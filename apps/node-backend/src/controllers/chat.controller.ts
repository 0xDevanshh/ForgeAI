import type { Request, Response } from "express";
import type { Readable } from "node:stream";
import { internalHttpClient } from "../lib/internalHttpClient";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { emitToUser } from "../lib/socket";
import { AppError } from "../middleware/errorHandler";
import type { ChatQueryInput } from "../validators/chat.validator";

// Generous — a full planner -> agent -> reviewer graph run can take a
// while, same reasoning as the other long-running internalHttpClient calls.
const QUERY_TIMEOUT_MS = 5 * 60 * 1000;

interface QuerySseEvent {
  node: string;
  data?: Record<string, unknown>;
}

// Consumes ai-service's SSE stream, re-emitting each frame to the user over
// Socket.IO as it arrives, and tracking whatever the graph's most recent
// generated_response/intent were — deliberately not tied to a specific node
// name (e.g. "passthrough"), since which node actually sets these fields
// will change as Steps 9/11/12/13 replace it with real agents.
async function consumeQueryStream(
  stream: Readable,
  userId: string,
): Promise<{ content: string | null; intent: string | null }> {
  let buffer = "";
  let content: string | null = null;
  let intent: string | null = null;

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
              if (typeof data.generated_response === "string") {
                content = data.generated_response;
              }
              if (typeof data.intent === "string") {
                intent = data.intent;
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

  return { content, intent };
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

  const response = await internalHttpClient.post(
    "/query",
    { query, repo_id: repoId, chat_session_id: chatSessionId, chat_history: chatHistory },
    { responseType: "stream", timeout: QUERY_TIMEOUT_MS },
  );

  const { content, intent } = await consumeQueryStream(response.data as Readable, userId);

  if (content === null) {
    throw new AppError("Query did not produce a response", 502);
  }

  await prisma.message.create({
    data: {
      chatSessionId,
      role: "ASSISTANT",
      content,
      agentType: intent,
    },
  });

  res.status(200).json({ status: "completed" });
}
