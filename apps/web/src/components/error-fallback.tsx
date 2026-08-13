"use client";

import { RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Shared crash screen. Used by both the client ErrorBoundary and the App
 * Router's error.tsx convention, so a render failure looks the same wherever
 * it originates.
 */
export function ErrorFallback({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="bp-grid flex min-h-screen items-center justify-center px-6">
      <div className="max-w-form space-y-4 text-center">
        <div className="space-y-1">
          <h1 className="text-xl">Something broke on this screen.</h1>
          <p className="text-sm text-foreground-secondary">
            The rest of the app is fine. Reloading usually clears it.
          </p>
        </div>

        {/* The message can name the failing component, which is worth showing
            to a developer-facing audience — but never the raw stack. */}
        {message ? (
          <p className="rounded-sm border border-subtle bg-surface p-3 text-left font-mono text-xs text-foreground-muted">
            {message}
          </p>
        ) : null}

        <div className="flex justify-center gap-2">
          {onRetry ? (
            <Button onClick={onRetry} variant="outline">
              Try again
            </Button>
          ) : null}
          <Button onClick={() => window.location.reload()}>
            <RotateCw />
            Reload
          </Button>
        </div>
      </div>
    </div>
  );
}
