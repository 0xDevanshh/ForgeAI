"use client";

import * as React from "react";
import { Check, ChevronDown, RotateCw } from "lucide-react";

import { completedStepCount, type PipelineState } from "@/lib/pipeline";
import { cn } from "@/lib/utils";

function StepMarker({ state }: { state: "pending" | "active" | "done" }) {
  if (state === "done") {
    return <Check className="size-3.5 shrink-0 text-success" aria-hidden />;
  }
  return (
    <span
      className={cn(
        "flex size-3.5 shrink-0 items-center justify-center font-mono text-xs leading-none",
        state === "active" ? "step-marker--active text-brand" : "text-foreground-muted"
      )}
      aria-hidden
    >
      ▸
    </span>
  );
}

/** The live trace, shown while the graph is running. */
export function PipelineStepper({ pipeline }: { pipeline: PipelineState }) {
  return (
    <ol className="space-y-2" aria-live="polite" aria-label="Answer pipeline">
      {pipeline.steps.map((step) => (
        <li key={step.id} className="flex items-center gap-2">
          <StepMarker state={step.state} />
          <span
            className={cn(
              "font-mono text-xs transition-colors duration-base ease-out",
              step.state === "done" && "text-foreground-secondary",
              step.state === "active" && "text-brand",
              step.state === "pending" && "text-foreground-muted"
            )}
          >
            {step.label}
          </span>
        </li>
      ))}

      {pipeline.regenerationCount > 0 ? (
        <li className="flex items-center gap-2 pt-1">
          <RotateCw className="size-3.5 shrink-0 text-warning" aria-hidden />
          <span className="font-mono text-xs text-warning">
            {regenerationLabel(pipeline.regenerationCount)}
          </span>
        </li>
      ) : null}
    </ol>
  );
}

function regenerationLabel(count: number): string {
  return count === 1 ? "Regenerated once after review" : `Regenerated ${count}× after review`;
}

/**
 * The collapsed summary shown above a finished answer. Expanding it re-shows
 * the trace — the multi-agent pipeline is a feature worth being able to
 * inspect, not something to hide once it's done.
 */
export function PipelineTrace({ pipeline }: { pipeline: PipelineState }) {
  const [open, setOpen] = React.useState(false);
  const done = completedStepCount(pipeline.steps);

  const verdict = pipeline.skippedReview
    ? "no review needed"
    : pipeline.reviewerApproved === false
      ? "flagged"
      : "verified";

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 font-mono text-xs text-foreground-muted transition-colors duration-base ease-out hover:text-foreground-secondary"
      >
        <ChevronDown
          className={cn("size-3 transition-transform duration-base ease-out", open && "rotate-180")}
          aria-hidden
        />
        {done} steps · {verdict}
        {pipeline.regenerationCount > 0 ? ` · regenerated ${pipeline.regenerationCount}×` : ""}
      </button>

      {open ? (
        <div className="animate-enter border-l border-subtle pl-3">
          <PipelineStepper pipeline={pipeline} />
        </div>
      ) : null}
    </div>
  );
}
