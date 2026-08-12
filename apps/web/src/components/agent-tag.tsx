import { cn } from "@/lib/utils"

/** Mirrors the planner's `intent` values in apps/ai-service. */
export type AgentType =
  | "architecture"
  | "bug_investigation"
  | "pr_summary"
  | "documentation"

const AGENT_LABELS: Record<AgentType, string> = {
  architecture: "architecture",
  bug_investigation: "bug_investigation",
  pr_summary: "pr_summary",
  documentation: "documentation",
}

const AGENT_MODIFIERS: Record<AgentType, string> = {
  architecture: "agent-tag--architecture",
  bug_investigation: "agent-tag--bug-investigation",
  pr_summary: "agent-tag--pr-summary",
  documentation: "agent-tag--documentation",
}

export function AgentTag({
  agent,
  className,
}: {
  agent: AgentType
  className?: string
}) {
  return (
    <span className={cn("agent-tag", AGENT_MODIFIERS[agent], className)}>
      {AGENT_LABELS[agent]}
    </span>
  )
}
