"use client";

import * as React from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { normalizeApiError } from "@/lib/api-client";
import {
  fetchGithubRepos,
  githubReposQueryKey,
  type GithubRepoSummary,
} from "@/lib/repos";
import { relativeTime } from "@/lib/time";

export function AddRepoDialog({
  open,
  onOpenChange,
  onSelect,
  addingRepoId,
  alreadyAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (repo: GithubRepoSummary) => void;
  addingRepoId: string | null;
  /** fullNames already indexed, so they can be shown as unavailable. */
  alreadyAdded: Set<string>;
}) {
  const [search, setSearch] = React.useState("");

  const { data, isPending, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: githubReposQueryKey,
      queryFn: ({ pageParam }) => fetchGithubRepos(pageParam),
      initialPageParam: 1,
      getNextPageParam: (lastPage) => lastPage.pagination.nextPage ?? undefined,
      // Only worth fetching once the dialog is actually open.
      enabled: open,
    });

  const repos = React.useMemo(
    () => data?.pages.flatMap((page) => page.repos) ?? [],
    [data]
  );

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return repos;
    return repos.filter((repo) => repo.fullName.toLowerCase().includes(term));
  }, [repos, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a repository</DialogTitle>
          <DialogDescription>
            Pick a repository to index. Indexing starts right away.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter repositories…"
            aria-label="Filter repositories"
            className="pl-9"
          />
        </div>

        <ScrollArea className="h-80">
          <div className="space-y-1 pr-3">
            {isPending ? (
              Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))
            ) : isError ? (
              <p className="px-1 py-8 text-center text-sm text-danger">
                {normalizeApiError(error).message}
              </p>
            ) : filtered.length === 0 ? (
              <p className="px-1 py-8 text-center text-sm text-foreground-secondary">
                {search
                  ? `No repositories match "${search}".`
                  : "No repositories found on your GitHub account."}
              </p>
            ) : (
              filtered.map((repo) => {
                const added = alreadyAdded.has(repo.fullName);
                const isAdding = addingRepoId === repo.githubRepoId;
                const updated = relativeTime(repo.updatedAt);

                return (
                  <button
                    key={repo.githubRepoId}
                    type="button"
                    disabled={added || isAdding}
                    onClick={() => onSelect(repo)}
                    className="flex w-full items-center justify-between gap-3 rounded-sm border border-transparent px-3 py-2 text-left transition-colors duration-base ease-out hover:border-subtle hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                  >
                    <span className="min-w-0 space-y-1">
                      <span className="block truncate font-mono text-sm text-foreground">
                        {repo.fullName}
                      </span>
                      {updated ? (
                        <span className="block text-xs text-foreground-muted">
                          Updated {updated}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline">{repo.private ? "Private" : "Public"}</Badge>
                      {added ? (
                        <span className="text-xs text-foreground-muted">Added</span>
                      ) : isAdding ? (
                        <span className="text-xs text-foreground-muted">Adding…</span>
                      ) : null}
                    </span>
                  </button>
                );
              })
            )}

            {hasNextPage && !search ? (
              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? "Loading…" : "Load more"}
                </Button>
              </div>
            ) : null}
          </div>
        </ScrollArea>

        {/* The filter only sees pages already fetched, so say so rather than
            letting someone conclude a repo doesn't exist. */}
        {search && hasNextPage ? (
          <p className="text-xs text-foreground-muted">
            Filtering {repos.length} loaded repositories. Clear the filter to load
            more.
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
