import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 border px-2 py-0.5 text-xs font-medium transition-colors duration-base ease-out focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-canvas",
  {
    variants: {
      variant: {
        default: "border-transparent bg-brand text-brand-foreground",
        secondary: "border-subtle bg-elevated text-foreground",
        outline: "border-strong text-foreground-secondary",
        // Status variants use a tinted wash + the status hue as text, so they
        // stay legible without a heavy solid fill.
        success: "border-success/25 bg-success/10 text-success",
        warning: "border-warning/25 bg-warning/10 text-warning",
        danger: "border-danger/25 bg-danger/10 text-danger",
      },
      shape: {
        // radius-sm is the default; pills are reserved for status.
        default: "rounded-sm",
        pill: "rounded-full px-2.5",
      },
    },
    defaultVariants: {
      variant: "default",
      shape: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, shape, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, shape }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
