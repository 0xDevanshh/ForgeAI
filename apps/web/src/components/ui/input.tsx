import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Blueprint: radius-sm, 1px border instead of a resting shadow,
          // surface fill so inputs read as recessed against the canvas.
          "flex h-10 w-full rounded-sm border border-strong bg-surface px-3 py-2 text-sm text-foreground transition-colors duration-base ease-out file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-foreground-muted hover:border-strong/80 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
