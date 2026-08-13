"use client";

import * as React from "react";
import { ArrowUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function Composer({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder = "Ask about this codebase…",
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  placeholder?: string;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);

  // Auto-grow: reset to auto first so the box can also shrink when text is
  // deleted, then clamp so a long paste can't take over the viewport.
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    // The ceiling comes from the max-h-composer token on the element itself,
    // so the clamp and the CSS can't drift apart.
    const ceiling = Number.parseFloat(getComputedStyle(el).maxHeight);
    el.style.height = `${Math.min(el.scrollHeight, ceiling || el.scrollHeight)}px`;
  }, [value]);

  const canSend = value.trim().length > 0 && !disabled;

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // ⌘/Ctrl+Enter sends; plain Enter stays a newline so multi-line questions
    // (stack traces, snippets) aren't cut short by muscle memory.
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (canSend) onSubmit();
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSubmit();
      }}
      className="flex items-end gap-2 rounded-md border border-subtle bg-canvas p-2"
    >
      <Textarea
        ref={ref}
        rows={1}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Ask about this codebase"
        className="max-h-composer border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
      />
      <Button
        type="submit"
        size="icon"
        disabled={!canSend}
        aria-label="Send question"
        aria-keyshortcuts="Meta+Enter Control+Enter"
      >
        <ArrowUp />
      </Button>
    </form>
  );
}
