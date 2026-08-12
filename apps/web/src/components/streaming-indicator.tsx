import { cn } from "@/lib/utils"

/**
 * A quiet three-dot pulse for in-flight agent work. Deliberately not a
 * spinner: a spinner reads as "blocked, wait", this reads as "thinking,
 * text is on its way". Falls back to a static state under
 * prefers-reduced-motion (handled in globals.css) so it still signals
 * activity without animating.
 */
export function StreamingIndicator({
  label = "Working",
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-mono text-xs text-foreground-muted",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <span className="streaming-dots" aria-hidden>
        <span />
        <span />
        <span />
      </span>
      {label}
    </span>
  )
}
