"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MessagesSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { normalizeApiError } from "@/lib/api-client";
import { fetchSessions, sessionsQueryKey } from "@/lib/chat";
import { relativeTime } from "@/lib/time";

/**
 * Every conversation across every repo. Chat itself always happens in the
 * context of one repository (/repos/[repoId]/chat), so this is a way back
 * into a past conversation rather than a place to start a new one.
 */
export default function ChatPage() {
  const {
    data: sessions,
    isPending,
    isError,
    error,
  } = useQuery({ queryKey: sessionsQueryKey(null), queryFn: () => fetchSessions() });

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl">Chat</h1>
        <p className="text-foreground-secondary">
          Your conversations across every indexed repository.
        </p>
      </div>

      {isPending ? (
        <div className="space-y-2" aria-hidden>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="space-y-2 px-6 py-12 text-center">
            <p className="font-medium text-foreground">We couldn&rsquo;t load your conversations.</p>
            <p className="text-sm text-foreground-secondary">
              {normalizeApiError(error).message}
            </p>
          </CardContent>
        </Card>
      ) : sessions.length === 0 ? (
        <Card className="bp-dots relative overflow-hidden">
          <CardContent className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <MessagesSquare className="size-6 text-foreground-muted" aria-hidden />
            <div className="max-w-measure space-y-1">
              <p className="font-medium text-foreground">No conversations yet.</p>
              <p className="text-sm text-foreground-secondary">
                Open an indexed repository to ask your first question.
              </p>
            </div>
            <Button asChild>
              <Link href="/repos">Go to repositories</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {sessions.map((session) => {
            const when = relativeTime(session.updatedAt);
            return (
              <li key={session.id}>
                <Link
                  href={`/repos/${session.repo.id}/chat?session=${session.id}`}
                  className="flex items-center justify-between gap-4 rounded-md border border-subtle bg-surface p-4 transition-colors duration-base ease-out hover:border-strong hover:bg-accent"
                >
                  <span className="min-w-0 space-y-1">
                    <span className="block truncate text-sm text-foreground">
                      {session.title ?? "New conversation"}
                    </span>
                    <span className="block truncate font-mono text-xs text-foreground-muted">
                      {session.repo.fullName}
                    </span>
                  </span>
                  <span className="shrink-0 text-right font-mono text-xs text-foreground-muted">
                    <span className="block">{session.messageCount} messages</span>
                    {when ? <span className="block">{when}</span> : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
