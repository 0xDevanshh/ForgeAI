import { isAgentType, type AgentType } from "@/lib/chat";

/** A frame forwarded from ai-service's LangGraph stream by node-backend. */
export interface QueryProgressEvent {
  node: string;
  data?: Record<string, unknown>;
}

export type StepState = "pending" | "active" | "done";

export interface PipelineStep {
  id: "classify" | "search" | "generate" | "verify";
  label: string;
  state: StepState;
}

export interface PipelineState {
  steps: PipelineStep[];
  agentType: AgentType | null;
  content: string | null;
  reviewerApproved: boolean | null;
  reviewerNotes: string[];
  regenerationCount: number;
  finished: boolean;
  /** True once a clarification-style answer arrived with no reviewer pass. */
  skippedReview: boolean;
}

const AGENT_NODES = new Set([
  "architecture_agent",
  "bug_investigation_agent",
  "pr_summary_agent",
  "documentation_agent",
]);

export function initialPipeline(): PipelineState {
  return {
    steps: [
      { id: "classify", label: "Classifying question…", state: "active" },
      { id: "search", label: "Searching codebase…", state: "pending" },
      { id: "generate", label: "Generating explanation…", state: "pending" },
      { id: "verify", label: "Verifying against sources…", state: "pending" },
    ],
    agentType: null,
    content: null,
    reviewerApproved: null,
    reviewerNotes: [],
    regenerationCount: 0,
    finished: false,
    skippedReview: false,
  };
}

function setStates(
  steps: PipelineStep[],
  updates: Partial<Record<PipelineStep["id"], StepState>>
): PipelineStep[] {
  return steps.map((step) => (updates[step.id] ? { ...step, state: updates[step.id]! } : step));
}

/**
 * Reads `generated_response`, which ai-service sends as a plain string
 * normally, or as { response, reviewer_approved, reviewer_notes } when the
 * reviewer rejected the answer up to the retry cap.
 */
function readResponse(value: unknown, next: PipelineState): void {
  if (typeof value === "string") {
    next.content = value;
    return;
  }
  if (value && typeof value === "object") {
    const flagged = value as Record<string, unknown>;
    if (typeof flagged.response === "string") next.content = flagged.response;
    if (typeof flagged.reviewer_approved === "boolean") {
      next.reviewerApproved = flagged.reviewer_approved;
    }
    if (Array.isArray(flagged.reviewer_notes)) {
      next.reviewerNotes = flagged.reviewer_notes.filter(
        (note): note is string => typeof note === "string"
      );
    }
  }
}

/**
 * Folds one progress frame into the pipeline view.
 *
 * The graph emits one event per *node*, and retrieval is not its own node —
 * search_codebase runs inside the agent node. So "Searching codebase" and
 * "Generating explanation" share a single observable boundary: both are known
 * to be underway once the planner reports, and both are complete once the
 * agent reports. The steps stay truthful about real phases; only the moment
 * we learn about them is shared.
 */
export function reducePipeline(state: PipelineState, event: QueryProgressEvent): PipelineState {
  const next: PipelineState = { ...state, steps: [...state.steps] };
  const data = event.data;

  if (data && typeof data.regeneration_count === "number") {
    next.regenerationCount = data.regeneration_count;
  }

  if (event.node === "planner") {
    if (data && isAgentType(data.intent)) next.agentType = data.intent;
    next.steps = setStates(next.steps, { classify: "done", search: "active" });
    return next;
  }

  if (AGENT_NODES.has(event.node)) {
    if (data && "generated_response" in data) readResponse(data.generated_response, next);
    // A second pass through an agent node means the reviewer sent it back.
    const looping = next.steps.find((s) => s.id === "verify")?.state === "done";
    next.steps = setStates(next.steps, {
      search: "done",
      generate: "done",
      verify: looping ? "active" : "active",
    });
    return next;
  }

  if (event.node === "reviewer") {
    const verdict = data?.reviewer_verdict as Record<string, unknown> | undefined;
    if (verdict && typeof verdict.approved === "boolean") {
      // Only trust this as the final word if nothing already flagged the
      // answer — attach_incomplete_flag is the authority when it fires.
      if (next.reviewerApproved === null) next.reviewerApproved = verdict.approved;
      if (!verdict.approved) {
        const issues = [
          ...(Array.isArray(verdict.grounding_issues) ? verdict.grounding_issues : []),
          ...(Array.isArray(verdict.missing_info) ? verdict.missing_info : []),
        ].filter((note): note is string => typeof note === "string");
        if (issues.length > 0) next.reviewerNotes = issues;
      }
    }
    next.steps = setStates(next.steps, { verify: "done" });
    return next;
  }

  if (event.node === "done") {
    next.finished = true;
    // pr_summary short-circuits to END when it can't find a commit reference,
    // so the reviewer never runs — don't leave that step spinning forever.
    if (next.steps.find((s) => s.id === "verify")?.state !== "done") {
      next.skippedReview = true;
      next.steps = setStates(next.steps, { verify: "done" });
    }
    next.steps = next.steps.map((step) =>
      step.state === "active" ? { ...step, state: "done" } : step
    );
    return next;
  }

  return next;
}

export function completedStepCount(steps: PipelineStep[]): number {
  return steps.filter((step) => step.state === "done").length;
}

/**
 * Rebuilds a finished pipeline view from what the server persisted on a
 * message.
 *
 * The live PipelineState only exists for the duration of one query, so
 * without this the trace would vanish the moment an answer was saved — and
 * never appear at all on a reloaded conversation. Every phase is marked done
 * because an answer exists at all, which is only true once the graph ran to
 * completion.
 */
export function reconstructPipeline(
  verdict: { approved: boolean; notes: string[]; regenerationCount: number } | null,
  agentType: AgentType | null
): PipelineState | undefined {
  if (!verdict) return undefined;

  const base = initialPipeline();
  return {
    ...base,
    steps: base.steps.map((step) => ({ ...step, state: "done" as const })),
    agentType,
    reviewerApproved: verdict.approved,
    reviewerNotes: verdict.notes,
    regenerationCount: verdict.regenerationCount,
    finished: true,
  };
}
