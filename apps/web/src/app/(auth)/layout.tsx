"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { BlueprintMotif } from "@/components/auth/blueprint-motif";
import { useAuth } from "@/lib/auth-context";

/**
 * Split-personality shell: at ≥1024px the product statement takes 55% and the
 * form 45%. Below that the statement panel collapses — its headline moves
 * inline above the form (see the pages themselves) so mobile users still get
 * the pitch without the motif eating the viewport.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  // Someone with a live session has no reason to see these screens.
  React.useEffect(() => {
    if (!isLoading && user) {
      router.replace("/repos");
    }
  }, [isLoading, user, router]);

  return (
    <div className="bp-grid flex min-h-screen flex-col lg:flex-row">
      <section className="hidden lg:flex lg:w-[55%] lg:flex-col lg:justify-between lg:border-r lg:border-subtle lg:bg-surface lg:p-12">
        <span className="font-display text-base font-semibold tracking-tight text-foreground">
          Codebase Copilot
        </span>

        <div className="max-w-measure space-y-4">
          <h1 className="text-3xl">Understand any codebase in minutes, not weeks.</h1>
          <p className="text-lg text-foreground-secondary">
            Ask questions in plain English and get answers grounded in the code
            itself — every claim checked against what's actually there.
          </p>
        </div>

        <div className="flex justify-start">
          <BlueprintMotif />
        </div>
      </section>

      <main className="flex flex-1 items-center justify-center px-6 py-12 lg:w-[45%]">
        <div className="animate-enter w-full max-w-form space-y-8">
          {/* Below lg the statement panel is gone, so the headline moves here.
              Defined once for both pages rather than repeated in each. */}
          <h1 className="text-2xl lg:hidden">
            Understand any codebase in minutes, not weeks.
          </h1>

          {/* Card chrome only below lg. At lg the panel split already separates
              form from statement, so a card there would be redundant boxing. */}
          <div className="rounded-md border border-subtle bg-surface p-6 lg:border-0 lg:bg-transparent lg:p-0">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
