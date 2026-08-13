"use client";

import Link from "next/link";

import { RepoStatus } from "@/components/repos/repo-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { topLanguages, type Repo } from "@/lib/repos";
import { cn } from "@/lib/utils";

export function RepoCard({
  repo,
  onReindex,
  onRemove,
  justCompleted,
}: {
  repo: Repo;
  onReindex: () => void;
  onRemove: () => void;
  /** Set briefly when a live COMPLETED event lands, to draw the eye. */
  justCompleted?: boolean;
}) {
  const languages = topLanguages(repo.languages);
  const isReady = repo.indexStatus === "COMPLETED";

  return (
    <Card
      className={cn(
        // `group` drives the hover-revealed actions below.
        "group flex flex-col transition-colors duration-base ease-out hover:border-strong",
        justCompleted && "border-success"
      )}
    >
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        <div className="space-y-3">
          {/* A repo identifier is code, so it takes monospace. */}
          <p className="truncate font-mono text-sm text-foreground" title={repo.fullName}>
            {repo.fullName}
          </p>

          {languages.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {languages.map((language) => (
                <span key={language} className="language-tag">
                  {language}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-auto space-y-4">
          <RepoStatus repo={repo} onRetry={onReindex} />

          {/* Hover-revealed on pointer devices, always visible on touch where
              there is no hover state to discover them with. */}
          <div
            className={cn(
              "flex flex-wrap items-center gap-2 border-t border-subtle pt-3",
              "opacity-100 transition-opacity duration-base ease-out",
              "md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100",
              // A card that just finished indexing keeps its actions visible:
              // the highlight is advertising a newly-available "Open chat", so
              // hiding it behind a hover would defeat the point.
              justCompleted && "md:opacity-100"
            )}
          >
            {isReady ? (
              <Button asChild size="sm" variant="secondary">
                <Link href={`/repos/${repo.id}/chat`}>Open chat</Link>
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={onReindex}>
              Re-index
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onRemove}
              className="text-danger hover:bg-danger/10 hover:text-danger"
            >
              Remove
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
