"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  // Dark is this product's default, so fall back to it rather than "system".
  const { theme = "dark" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-md group-[.toaster]:border group-[.toaster]:border-strong group-[.toaster]:bg-elevated group-[.toaster]:text-foreground group-[.toaster]:shadow-lg group-[.toaster]:font-sans",
          description: "group-[.toast]:text-foreground-secondary",
          actionButton:
            "group-[.toast]:rounded-sm group-[.toast]:bg-brand group-[.toast]:text-brand-foreground",
          cancelButton:
            "group-[.toast]:rounded-sm group-[.toast]:bg-surface group-[.toast]:text-foreground-secondary",
          success: "group-[.toaster]:text-success",
          warning: "group-[.toaster]:text-warning",
          error: "group-[.toaster]:text-danger",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
