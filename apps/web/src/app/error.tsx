"use client";

import * as React from "react";

import { ErrorFallback } from "@/components/error-fallback";

/**
 * The App Router's own error boundary. Covers what the client ErrorBoundary
 * can't see — errors thrown while rendering on the server — so neither path
 * ends in a white screen.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("Route render error:", error);
  }, [error]);

  return <ErrorFallback message={error.message} onRetry={reset} />;
}
