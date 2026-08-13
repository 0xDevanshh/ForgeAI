"use client";

import { AlertTriangle } from "lucide-react";

import { MarkdownContent } from "@/components/chat/markdown-content";
import { PipelineTrace } from "@/components/chat/pipeline-stepper";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AGENT_BORDER_CLASS,
  AGENT_LABELS,
  AGENT_TAG_CLASS,
  type AgentType,
  type ReviewerVerdict,
} from "@/lib/chat";
import type { PipelineState } from "@/lib/pipeline";
import { cn } from "@/lib/utils";

export function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      {/* A bubble suits a short prompt; the assistant's long-form answer gets
          a full-width block instead. */}
      <div className="max-w-[85%] rounded-md bg-elevated px-4 py-2.5 text-sm text-foreground">
        {content}
      </div>
    </div>
  );
}

function ReviewerFlag({ notes }: { notes: string[] }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <p className="flex items-start gap-2 text-xs text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span className="underline decoration-dotted underline-offset-4">
            Verification found gaps — this answer may be incomplete.
          </span>
        </p>
      </TooltipTrigger>
      <TooltipContent className="max-w-form">
        {notes.length > 0 ? (
          <ul className="space-y-1">
            {notes.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        ) : (
          "The reviewer couldn't fully verify this answer against the retrieved code."
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export function AssistantMessage({
  content,
  agentType,
  verdict,
  pipeline,
  children,
}: {
  content: string;
  agentType: AgentType | null;
  verdict?: ReviewerVerdict | null;
  /** Present on the live message, so the trace can be re-expanded. */
  pipeline?: PipelineState;
  children?: React.ReactNode;
}) {
  const flagged = verdict ? !verdict.approved : false;
  const notes = verdict?.notes ?? [];

  return (
    <div className="space-y-2">
      {agentType ? (
        <span className={cn("agent-tag", AGENT_TAG_CLASS[agentType])}>
          {AGENT_LABELS[agentType]}
        </span>
      ) : null}

      {/* Not a bubble: a full-width block with a code-gutter left border in
          the agent's colour, so the source of an answer is legible at a
          glance without reading the tag. */}
      <div
        className={cn(
          "space-y-4 rounded-md rounded-l-none border-l-2 bg-surface p-4",
          agentType ? AGENT_BORDER_CLASS[agentType] : "border-l-strong"
        )}
      >
        {children}
        {content ? <MarkdownContent>{content}</MarkdownContent> : null}
        {flagged ? <ReviewerFlag notes={notes} /> : null}
        {pipeline?.finished ? <PipelineTrace pipeline={pipeline} /> : null}
      </div>
    </div>
  );
}
