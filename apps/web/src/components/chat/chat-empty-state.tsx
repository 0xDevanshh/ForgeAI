import type { AgentType } from "@/lib/chat";
import { AGENT_TAG_CLASS } from "@/lib/chat";
import { cn } from "@/lib/utils";

/**
 * One example per agent type: the chips both give someone a way in and
 * quietly demonstrate that four different specialists are available.
 */
const EXAMPLES: { text: string; agent: AgentType }[] = [
  { text: "Explain the authentication flow", agent: "architecture" },
  { text: "Why might payments be stuck in pending?", agent: "bug_investigation" },
  { text: "Summarize the latest commit", agent: "pr_summary" },
  { text: "Document the API routes", agent: "documentation" },
];

export function ChatEmptyState({ onPick }: { onPick: (question: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-6 py-16 text-center">
      <div className="space-y-1">
        <p className="font-medium text-foreground">Ask anything about this repository.</p>
        <p className="text-sm text-foreground-secondary">
          Answers are grounded in the indexed code and checked before you see them.
        </p>
      </div>

      <ul className="flex w-full max-w-measure flex-col gap-2 sm:grid sm:grid-cols-2">
        {EXAMPLES.map((example) => (
          <li key={example.text}>
            <button
              type="button"
              onClick={() => onPick(example.text)}
              className="w-full rounded-md border border-subtle bg-surface p-3 text-left transition-colors duration-base ease-out hover:border-strong hover:bg-accent"
            >
              <span className="block text-sm text-foreground">{example.text}</span>
              <span
                className={cn("agent-tag mt-2", AGENT_TAG_CLASS[example.agent])}
                aria-hidden
              >
                {example.agent}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
