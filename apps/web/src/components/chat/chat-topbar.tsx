"use client";

import Link from "next/link";
import { ArrowLeft, Check, MessageSquarePlus, History } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ChatSession } from "@/lib/chat";
import { isActive, type IndexStatus } from "@/lib/repos";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

function StatusPill({ status }: { status: IndexStatus }) {
  if (status === "COMPLETED") {
    return (
      <Badge variant="success" shape="pill">
        Indexed
      </Badge>
    );
  }
  if (status === "FAILED") {
    return (
      <Badge variant="danger" shape="pill">
        Failed
      </Badge>
    );
  }
  if (isActive(status)) {
    return (
      <Badge variant="outline" shape="pill" className="text-brand">
        Indexing…
      </Badge>
    );
  }
  return (
    <Badge variant="outline" shape="pill">
      Queued
    </Badge>
  );
}

export function ChatTopbar({
  repoFullName,
  indexStatus,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  isCreating,
}: {
  repoFullName: string;
  indexStatus: IndexStatus;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
  isCreating: boolean;
}) {
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-subtle bg-surface px-4 py-3">
      <Button asChild variant="ghost" size="icon" aria-label="Back to repositories">
        <Link href="/repos">
          <ArrowLeft />
        </Link>
      </Button>

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="truncate font-mono text-sm text-foreground" title={repoFullName}>
          {repoFullName}
        </span>
        <StatusPill status={indexStatus} />
      </div>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={sessions.length === 0}>
              <History />
              Chats
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>Conversations</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {sessions.map((session) => {
              const when = relativeTime(session.updatedAt);
              return (
                <DropdownMenuItem
                  key={session.id}
                  onSelect={() => onSelectSession(session.id)}
                  className="flex-col items-start gap-0.5"
                >
                  <span className="flex w-full items-center gap-2">
                    {session.id === activeSessionId ? (
                      <Check className="size-3.5 shrink-0 text-brand" aria-hidden />
                    ) : (
                      <span className="size-3.5 shrink-0" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {session.title ?? "New conversation"}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "pl-5 font-mono text-xs text-foreground-muted",
                      session.id === activeSessionId && "text-foreground-secondary"
                    )}
                  >
                    {session.messageCount} messages{when ? ` · ${when}` : ""}
                  </span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button size="sm" onClick={onNewChat} disabled={isCreating}>
          <MessageSquarePlus />
          {isCreating ? "Starting…" : "New chat"}
        </Button>
      </div>
    </header>
  );
}
