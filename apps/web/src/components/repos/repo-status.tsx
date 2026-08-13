import { relativeTime } from "@/lib/time";
import { isActive, type Repo } from "@/lib/repos";
import { cn } from "@/lib/utils";

/** Stage wording shown while indexing is in flight. */
const STAGE_LABELS: Record<string, string> = {
  CLONING: "Cloning",
  PARSING: "Parsing",
  EMBEDDING: "Embedding",
};

function Dot({ className }: { className: string }) {
  return <span className={cn("size-2 shrink-0 rounded-full", className)} aria-hidden />;
}

export function RepoStatus({
  repo,
  onRetry,
}: {
  repo: Repo;
  onRetry: () => void;
}) {
  if (isActive(repo.indexStatus)) {
    const stage = STAGE_LABELS[repo.indexStatus] ?? "Working";
    return (
      <div className="space-y-2">
        <p className="font-mono text-xs text-brand">
          {stage}… {repo.progress}%
        </p>
        <div
          className="progress-track"
          role="progressbar"
          aria-valuenow={repo.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${stage} ${repo.fullName}`}
        >
          <div
            className="progress-fill progress-fill--active"
            style={{ width: `${repo.progress}%` }}
          />
        </div>
      </div>
    );
  }

  if (repo.indexStatus === "COMPLETED") {
    const when = relativeTime(repo.lastIndexedAt);
    return (
      <p className="flex items-center gap-2 text-xs text-foreground-secondary">
        <Dot className="bg-success" />
        <span className="text-success">Indexed</span>
        {when ? <span className="text-foreground-muted">{when}</span> : null}
      </p>
    );
  }

  if (repo.indexStatus === "FAILED") {
    return (
      <div className="space-y-1">
        <p className="flex items-center gap-2 text-xs">
          <Dot className="bg-danger" />
          <span className="text-danger">Failed</span>
          <button
            type="button"
            onClick={onRetry}
            className="text-brand underline-offset-4 hover:underline"
          >
            Retry
          </button>
        </p>
        {repo.errorMessage ? (
          <p className="truncate text-xs text-foreground-muted" title={repo.errorMessage}>
            {repo.errorMessage}
          </p>
        ) : null}
      </div>
    );
  }

  // PENDING
  return (
    <p className="flex items-center gap-2 text-xs text-foreground-muted">
      <Dot className="bg-strong" />
      Queued
    </p>
  );
}
