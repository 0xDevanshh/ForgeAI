"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { MobileTopbar } from "@/components/shell/mobile-topbar";
import { Sidebar } from "@/components/shell/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";

/** Shown only while the initial silent refresh is still in flight. */
function ShellFallback() {
  return (
    <div className="flex min-h-screen">
      <div className="hidden w-sidebar shrink-0 border-r border-subtle bg-surface p-4 md:block">
        <Skeleton className="h-5 w-40" />
        <div className="mt-6 space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
      <div className="flex-1 space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full max-w-measure" />
        <Skeleton className="h-4 w-2/3 max-w-measure" />
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  // Waits for the refresh attempt to resolve before deciding — redirecting on
  // `!user` alone would bounce every reload to /login before the httpOnly
  // cookie ever got a chance to restore the session.
  React.useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  if (isLoading) {
    return <ShellFallback />;
  }

  // Redirect is already queued; rendering the shell for an unauthenticated user
  // would flash protected chrome.
  if (!user) {
    return <ShellFallback />;
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopbar />
        <main className="bp-grid flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
