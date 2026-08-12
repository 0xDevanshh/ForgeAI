"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth-context";

/**
 * Entry point with nothing of its own to show: it waits for the silent refresh
 * to resolve, then hands off to the app or to sign-in.
 */
export default function RootPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  React.useEffect(() => {
    if (isLoading) return;
    router.replace(user ? "/repos" : "/login");
  }, [isLoading, user, router]);

  return (
    <div className="bp-grid flex min-h-screen items-center justify-center">
      <span className="sr-only">Loading</span>
    </div>
  );
}
