"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { AddRepoDialog } from "@/components/repos/add-repo-dialog";
import { GithubConnectBanner } from "@/components/repos/github-connect-banner";
import { RemoveRepoDialog } from "@/components/repos/remove-repo-dialog";
import { RepoCard } from "@/components/repos/repo-card";
import { RepoGridSkeleton } from "@/components/repos/repo-card-skeleton";
import { ReposEmptyState } from "@/components/repos/repos-empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIndexProgress } from "@/hooks/use-index-progress";
import { normalizeApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import {
  addRepo,
  fetchRepos,
  reindexRepo,
  removeRepo,
  reposQueryKey,
  type GithubRepoSummary,
  type Repo,
} from "@/lib/repos";

/** How long a freshly-completed card keeps its highlight. */
const COMPLETION_HIGHLIGHT_MS = 6000;

export default function ReposPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [addOpen, setAddOpen] = React.useState(false);
  const [repoToRemove, setRepoToRemove] = React.useState<Repo | null>(null);
  const [recentlyCompleted, setRecentlyCompleted] = React.useState<Set<string>>(new Set());

  const isGithubConnected = Boolean(user?.githubUsername);

  const {
    data: repos,
    isPending,
    isError,
    error,
  } = useQuery({ queryKey: reposQueryKey, queryFn: fetchRepos });

  // Patches individual cards from socket events; never refetches the list.
  useIndexProgress(repos);

  // Watches for cards flipping to COMPLETED so the "Open chat" action can be
  // highlighted as it becomes available.
  const previousStatuses = React.useRef(new Map<string, string>());
  React.useEffect(() => {
    if (!repos) return;
    const freshlyDone: string[] = [];

    for (const repo of repos) {
      const before = previousStatuses.current.get(repo.id);
      if (before && before !== "COMPLETED" && repo.indexStatus === "COMPLETED") {
        freshlyDone.push(repo.id);
      }
      previousStatuses.current.set(repo.id, repo.indexStatus);
    }

    if (freshlyDone.length === 0) return;

    setRecentlyCompleted((current) => new Set([...current, ...freshlyDone]));
    const timer = setTimeout(() => {
      setRecentlyCompleted((current) => {
        const next = new Set(current);
        for (const id of freshlyDone) next.delete(id);
        return next;
      });
    }, COMPLETION_HIGHLIGHT_MS);

    return () => clearTimeout(timer);
  }, [repos]);

  const addMutation = useMutation({
    mutationFn: addRepo,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: reposQueryKey });
      const previous = queryClient.getQueryData<Repo[]>(reposQueryKey);

      // Optimistic PENDING card so the grid responds instantly. The temporary
      // id is replaced with the server's in onSuccess.
      const optimistic: Repo = {
        id: `optimistic:${input.githubRepoId}`,
        fullName: input.fullName,
        indexStatus: "PENDING",
        lastIndexedAt: null,
        createdAt: new Date().toISOString(),
        languages: null,
        progress: 0,
        errorMessage: null,
      };

      queryClient.setQueryData<Repo[]>(reposQueryKey, (current) => [
        optimistic,
        ...(current ?? []),
      ]);

      setAddOpen(false);
      return { previous, optimisticId: optimistic.id };
    },
    onSuccess: (created, input, context) => {
      // Swap the placeholder for the real row — the real id is what the socket
      // subscription needs to receive progress on.
      queryClient.setQueryData<Repo[]>(reposQueryKey, (current) =>
        (current ?? []).map((repo) =>
          repo.id === context?.optimisticId
            ? {
                ...repo,
                ...created,
                progress: created.progress ?? 0,
                errorMessage: created.errorMessage ?? null,
                languages: created.languages ?? null,
              }
            : repo
        )
      );
      toast.success(`Indexing started for ${input.fullName}`);
    },
    onError: (err, _input, context) => {
      queryClient.setQueryData(reposQueryKey, context?.previous);
      const { status, message } = normalizeApiError(err);
      toast.error(
        status === 409 ? "That repository is already added." : `Couldn't add it. ${message}`
      );
    },
  });

  const reindexMutation = useMutation({
    mutationFn: reindexRepo,
    onSuccess: (_data, repoId) => {
      // Reflect the queued state immediately; the socket drives it from here.
      queryClient.setQueryData<Repo[]>(reposQueryKey, (current) =>
        (current ?? []).map((repo) =>
          repo.id === repoId
            ? { ...repo, indexStatus: "PENDING", progress: 0, errorMessage: null }
            : repo
        )
      );
      toast.success("Re-indexing started");
    },
    onError: (err) => {
      const { status, message } = normalizeApiError(err);
      toast.error(
        status === 429
          ? "You've re-indexed this repository too many times. Try again later."
          : `Couldn't start re-indexing. ${message}`
      );
    },
  });

  const removeMutation = useMutation({
    mutationFn: removeRepo,
    onSuccess: (_data, repoId) => {
      queryClient.setQueryData<Repo[]>(reposQueryKey, (current) =>
        (current ?? []).filter((repo) => repo.id !== repoId)
      );
      setRepoToRemove(null);
      toast.success("Repository removed");
    },
    onError: (err) => {
      toast.error(`Couldn't remove it. ${normalizeApiError(err).message}`);
    },
  });

  const addedFullNames = React.useMemo(
    () => new Set((repos ?? []).map((repo) => repo.fullName)),
    [repos]
  );

  function handleSelect(githubRepo: GithubRepoSummary) {
    addMutation.mutate({
      githubRepoId: githubRepo.githubRepoId,
      fullName: githubRepo.fullName,
    });
  }

  const addButton = (
    <Button onClick={() => setAddOpen(true)} disabled={!isGithubConnected}>
      Add repository
    </Button>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl">Repositories</h1>
          <p className="text-foreground-secondary">
            Connect a repo to index it and start asking questions.
          </p>
        </div>

        {isGithubConnected ? (
          addButton
        ) : (
          <Tooltip>
            {/* A disabled button swallows pointer events, so the trigger wraps
                it in a span that can still receive hover/focus. */}
            <TooltipTrigger asChild>
              <span tabIndex={0}>{addButton}</span>
            </TooltipTrigger>
            <TooltipContent>Connect GitHub first</TooltipContent>
          </Tooltip>
        )}
      </div>

      {!isGithubConnected ? <GithubConnectBanner /> : null}

      {isPending ? (
        <RepoGridSkeleton />
      ) : isError ? (
        <Card>
          <CardContent className="space-y-3 px-6 py-12 text-center">
            <p className="font-medium text-foreground">We couldn&rsquo;t load your repositories.</p>
            <p className="text-sm text-foreground-secondary">
              {normalizeApiError(error).message}
            </p>
            <Button
              variant="outline"
              onClick={() => queryClient.invalidateQueries({ queryKey: reposQueryKey })}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : repos.length === 0 ? (
        <ReposEmptyState onAdd={() => setAddOpen(true)} canAdd={isGithubConnected} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {repos.map((repo) => (
            <RepoCard
              key={repo.id}
              repo={repo}
              justCompleted={recentlyCompleted.has(repo.id)}
              onReindex={() => reindexMutation.mutate(repo.id)}
              onRemove={() => setRepoToRemove(repo)}
            />
          ))}
        </div>
      )}

      <AddRepoDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSelect={handleSelect}
        addingRepoId={addMutation.isPending ? addMutation.variables?.githubRepoId ?? null : null}
        alreadyAdded={addedFullNames}
      />

      <RemoveRepoDialog
        repo={repoToRemove}
        onOpenChange={(open) => !open && setRepoToRemove(null)}
        onConfirm={() => repoToRemove && removeMutation.mutate(repoToRemove.id)}
        isRemoving={removeMutation.isPending}
      />
    </div>
  );
}
