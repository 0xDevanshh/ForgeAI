"use client";

import * as React from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ChatEmptyState } from "@/components/chat/chat-empty-state";
import { AssistantMessage, UserMessage } from "@/components/chat/chat-messages";
import { ChatTopbar } from "@/components/chat/chat-topbar";
import { Composer } from "@/components/chat/composer";
import { PipelineStepper } from "@/components/chat/pipeline-stepper";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { normalizeApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import {
  createSession,
  fetchMessages,
  fetchSessions,
  isAgentType,
  messagesQueryKey,
  sendQuery,
  sessionsQueryKey,
  type ChatMessage,
} from "@/lib/chat";
import {
  initialPipeline,
  reconstructPipeline,
  reducePipeline,
  type PipelineState,
  type QueryProgressEvent,
} from "@/lib/pipeline";
import { fetchRepos, reposQueryKey } from "@/lib/repos";
import { getSocket } from "@/lib/socket-client";

function RepoChat() {
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  // /chat links here with a specific conversation to open.
  const requestedSessionId = useSearchParams().get("session");
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [pipeline, setPipeline] = React.useState<PipelineState | null>(null);
  const threadRef = React.useRef<HTMLDivElement>(null);

  // The repo list is already cached by /repos; reusing it avoids a dedicated
  // single-repo endpoint that doesn't exist.
  const { data: repos } = useQuery({ queryKey: reposQueryKey, queryFn: fetchRepos });
  const repo = repos?.find((r) => r.id === repoId);

  const { data: sessions } = useQuery({
    queryKey: sessionsQueryKey(repoId),
    queryFn: () => fetchSessions(repoId),
  });

  // Open the conversation asked for in the URL; otherwise land in the most
  // recent one, so a reload resumes where the user left off.
  React.useEffect(() => {
    if (sessionId !== null || !sessions || sessions.length === 0) return;
    const requested = sessions.find((s) => s.id === requestedSessionId);
    setSessionId(requested?.id ?? sessions[0].id);
  }, [sessions, sessionId, requestedSessionId]);

  const { data: messages, isPending: messagesPending } = useQuery({
    queryKey: messagesQueryKey(sessionId ?? ""),
    queryFn: () => fetchMessages(sessionId!),
    enabled: sessionId !== null,
  });

  const newSessionMutation = useMutation({
    mutationFn: () => createSession(repoId),
    onSuccess: (session) => {
      queryClient.setQueryData(sessionsQueryKey(repoId), (current: typeof sessions) => [
        session,
        ...(current ?? []),
      ]);
      // The cross-repo list on /chat is now stale too.
      void queryClient.invalidateQueries({ queryKey: sessionsQueryKey(null) });
      setSessionId(session.id);
      setPipeline(null);
      setDraft("");
    },
    onError: (err) => toast.error(`Couldn't start a chat. ${normalizeApiError(err).message}`),
  });

  const isStreaming = pipeline !== null && !pipeline.finished;

  // Live pipeline frames. The socket carries one channel for all queries, so
  // this listener lives for the page's lifetime rather than per-message.
  React.useEffect(() => {
    if (!accessToken) return;
    const socket = getSocket(accessToken);

    const handler = (event: QueryProgressEvent) => {
      setPipeline((current) => (current ? reducePipeline(current, event) : current));
    };

    socket.on("queryProgress", handler);
    return () => {
      socket.off("queryProgress", handler);
    };
  }, [accessToken]);

  const askMutation = useMutation({
    mutationFn: (question: string) =>
      sendQuery({
        query: question,
        repoId,
        chatSessionId: sessionId!,
        chatHistory: (messages ?? []).map((m) => ({
          role: m.role.toLowerCase(),
          content: m.content,
        })),
      }),
    onMutate: (question) => {
      // Optimistic user message so the thread responds instantly; the server
      // persists its own copy, which replaces this on reconcile.
      const optimistic: ChatMessage = {
        id: `optimistic:${Date.now()}`,
        role: "USER",
        content: question,
        agentType: null,
        reviewerVerdict: null,
        createdAt: new Date().toISOString(),
        pending: true,
      };
      queryClient.setQueryData<ChatMessage[]>(messagesQueryKey(sessionId!), (current) => [
        ...(current ?? []),
        optimistic,
      ]);
      setDraft("");
      setPipeline(initialPipeline());
    },
    onSuccess: () => {
      // The server owns both persisted rows now — refetch so ids, timestamps
      // and the reviewer verdict all come from the source of truth.
      void queryClient.invalidateQueries({ queryKey: messagesQueryKey(sessionId!) });
      void queryClient.invalidateQueries({ queryKey: sessionsQueryKey(repoId) });
      setPipeline(null);
    },
    onError: (err) => {
      const { status, message } = normalizeApiError(err);
      queryClient.setQueryData<ChatMessage[]>(messagesQueryKey(sessionId!), (current) =>
        (current ?? []).filter((m) => !m.pending)
      );
      setPipeline(null);
      toast.error(
        status === 429
          ? "You're asking a lot at once. Give it a moment and try again."
          : `That question didn't go through. ${message}`
      );
    },
  });

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed) return;

    // First question in a repo with no session yet: create one, then send.
    let targetSession = sessionId;
    if (!targetSession) {
      try {
        const session = await newSessionMutation.mutateAsync();
        targetSession = session.id;
      } catch {
        return;
      }
    }
    askMutation.mutate(trimmed);
  }

  // Keep the newest turn in view as the thread and the stepper grow.
  React.useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pipeline]);

  const hasMessages = (messages?.length ?? 0) > 0;

  return (
    // Fixed viewport height so the thread scrolls under a pinned composer
    // rather than the whole page scrolling.
    <div className="-mx-6 -my-8 flex h-[calc(100vh-var(--space-16))] flex-col md:h-screen">
      <ChatTopbar
        repoFullName={repo?.fullName ?? "…"}
        indexStatus={repo?.indexStatus ?? "PENDING"}
        sessions={sessions ?? []}
        activeSessionId={sessionId}
        onSelectSession={(id) => {
          setSessionId(id);
          setPipeline(null);
        }}
        onNewChat={() => newSessionMutation.mutate()}
        isCreating={newSessionMutation.isPending}
      />

      <div ref={threadRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-measure space-y-6">
          {sessionId && messagesPending ? (
            <div className="space-y-4">
              <Skeleton className="ml-auto h-10 w-2/3" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : !hasMessages && !isStreaming ? (
            <ChatEmptyState onPick={(question) => setDraft(question)} />
          ) : (
            (messages ?? []).map((message) =>
              message.role === "USER" ? (
                <UserMessage key={message.id} content={message.content} />
              ) : (
                <AssistantMessage
                  key={message.id}
                  content={message.content}
                  agentType={isAgentType(message.agentType) ? message.agentType : null}
                  verdict={message.reviewerVerdict}
                  // Rebuilt from the persisted verdict so the trace survives
                  // both the save and a page reload.
                  pipeline={reconstructPipeline(
                    message.reviewerVerdict,
                    isAgentType(message.agentType) ? message.agentType : null
                  )}
                />
              )
            )
          )}

          {/* The live answer: the stepper stands in for the response until the
              graph finishes, then the trace collapses above it. */}
          {pipeline ? (
            <AssistantMessage
              content={pipeline.finished ? (pipeline.content ?? "") : ""}
              agentType={pipeline.agentType}
              pipeline={pipeline}
              verdict={
                pipeline.finished && pipeline.reviewerApproved !== null
                  ? {
                      approved: pipeline.reviewerApproved,
                      notes: pipeline.reviewerNotes,
                      regenerationCount: pipeline.regenerationCount,
                    }
                  : null
              }
            >
              {!pipeline.finished ? <PipelineStepper pipeline={pipeline} /> : null}
            </AssistantMessage>
          ) : null}
        </div>
      </div>

      <div className="border-t border-subtle bg-surface px-4 py-3">
        <div className="mx-auto max-w-measure space-y-2">
          <Composer
            value={draft}
            onChange={setDraft}
            onSubmit={() => ask(draft)}
            disabled={isStreaming || askMutation.isPending}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-xs text-foreground-muted">⌘↵ to send</p>
            {repo && repo.indexStatus !== "COMPLETED" ? (
              <p className="text-xs text-warning">
                This repository is still indexing — answers may be incomplete.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RepoChatPage() {
  return (
    <React.Suspense fallback={null}>
      <RepoChat />
    </React.Suspense>
  );
}
