"use client";

import * as React from "react";

import { ErrorFallback } from "@/components/error-fallback";

interface State {
  error: Error | null;
}

/**
 * Catches render-time crashes below the app shell so a thrown exception
 * produces a usable screen instead of a blank white page.
 *
 * Class component because `componentDidCatch` has no hook equivalent — React
 * exposes error boundaries only through the class API. Server-side render
 * errors are handled separately by app/error.tsx, which this cannot see.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Console rather than a toast: the UI is already replaced, and the stack is
    // what's actually useful to whoever debugs it.
    console.error("Unhandled render error:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <ErrorFallback
        message={this.state.error.message}
        onRetry={() => this.setState({ error: null })}
      />
    );
  }
}
