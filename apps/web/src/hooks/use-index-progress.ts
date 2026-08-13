"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth-context";
import { reposQueryKey, type Repo } from "@/lib/repos";
import {
  getSocket,
  indexProgressEvent,
  type IndexProgressEvent,
} from "@/lib/socket-client";

/**
 * Subscribes to live index progress for the given repos and patches the query
 * cache in place.
 *
 * The worker emits one channel per repo (`indexProgress:<repoId>`) rather than
 * a single stream carrying a repoId, so this attaches a listener per repo and
 * re-attaches whenever the set of ids changes.
 */
export function useIndexProgress(repos: Repo[] | undefined) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  // Depend on the id *string*, not the array: `repos` is a new reference on
  // every cache patch, so using it directly would tear down and rebuild every
  // listener on each progress tick.
  const repoIds = React.useMemo(
    () => (repos ?? []).map((repo) => repo.id).sort().join(","),
    [repos]
  );

  React.useEffect(() => {
    if (!accessToken || !repoIds) return;

    const socket = getSocket(accessToken);
    const ids = repoIds.split(",");

    const handlers = ids.map((repoId) => {
      const eventName = indexProgressEvent(repoId);

      const handler = (event: IndexProgressEvent) => {
        // Surgical patch of just this repo — refetching the whole list on a
        // progress tick would flicker every card and waste a round trip.
        queryClient.setQueryData<Repo[]>(reposQueryKey, (current) => {
          if (!current) return current;
          return current.map((repo) => {
            if (repo.id !== repoId) return repo;

            if (event.status === "FAILED") {
              // The failure payload carries no progress value, so the last
              // known one is kept rather than resetting the bar to zero.
              return { ...repo, indexStatus: "FAILED", errorMessage: event.error };
            }

            return {
              ...repo,
              indexStatus: event.status,
              progress: event.progress,
              errorMessage: null,
              lastIndexedAt:
                event.status === "COMPLETED" ? new Date().toISOString() : repo.lastIndexedAt,
            };
          });
        });

        if (event.status === "COMPLETED") {
          const name =
            queryClient
              .getQueryData<Repo[]>(reposQueryKey)
              ?.find((repo) => repo.id === repoId)?.fullName ?? "Repository";
          toast.success(`${name} is ready`, {
            description: "You can start asking questions about it now.",
          });
        }

        if (event.status === "FAILED") {
          const name =
            queryClient
              .getQueryData<Repo[]>(reposQueryKey)
              ?.find((repo) => repo.id === repoId)?.fullName ?? "Repository";
          toast.error(`Indexing failed for ${name}`, { description: event.error });
        }
      };

      socket.on(eventName, handler);
      return { eventName, handler };
    });

    return () => {
      for (const { eventName, handler } of handlers) {
        socket.off(eventName, handler);
      }
    };
  }, [accessToken, repoIds, queryClient]);
}
