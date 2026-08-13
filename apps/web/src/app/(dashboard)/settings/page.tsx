"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { normalizeApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { disconnectGithub, startGithubConnect } from "@/lib/github";

/**
 * The OAuth callback redirects here with ?github=connected or
 * ?error=oauth_failed (see node-backend github.controller.ts), so this page is
 * where the account-linking round trip lands.
 */
function GithubSettings() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, refreshUser } = useAuth();
  const [isDisconnecting, setIsDisconnecting] = React.useState(false);

  const connected = Boolean(user?.githubUsername);
  const outcome = searchParams.get("github");
  const error = searchParams.get("error");

  // Report the round trip once, then strip the params so a refresh doesn't
  // replay the toast.
  const reported = React.useRef(false);
  React.useEffect(() => {
    if (reported.current || (!outcome && !error)) return;
    reported.current = true;

    if (outcome === "connected") {
      toast.success("GitHub connected", {
        description: "You can import repositories now.",
      });
    } else if (error === "oauth_failed") {
      toast.error("We couldn't connect your GitHub account.", {
        description: "The sign-in didn't complete. Try again.",
      });
    }

    router.replace("/settings");
  }, [outcome, error, router]);

  async function handleDisconnect() {
    setIsDisconnecting(true);
    try {
      await disconnectGithub();
      // The context's copy of the user is now stale — re-read it so the UI
      // and the repos page agree about connection state.
      await refreshUser();
      toast.success("GitHub disconnected", {
        description: "Repositories you've already indexed are unaffected.",
      });
    } catch (err) {
      toast.error(`Couldn't disconnect. ${normalizeApiError(err).message}`);
    } finally {
      setIsDisconnecting(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="space-y-1">
          <p className="font-medium text-foreground">GitHub</p>
          {connected ? (
            <p className="text-sm text-foreground-secondary">
              Connected as{" "}
              <span className="font-mono text-foreground">{user?.githubUsername}</span>
            </p>
          ) : (
            <p className="text-sm text-foreground-secondary">
              Connect your account to import repositories.
            </p>
          )}
        </div>

        {connected ? (
          <Button variant="outline" onClick={handleDisconnect} disabled={isDisconnecting}>
            {isDisconnecting ? "Disconnecting…" : "Disconnect"}
          </Button>
        ) : (
          <Button onClick={startGithubConnect}>Connect GitHub</Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-measure space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl">Settings</h1>
        <p className="text-foreground-secondary">
          Manage the accounts connected to Codebase Copilot.
        </p>
      </div>

      {/* useSearchParams needs a Suspense boundary to prerender statically. */}
      <React.Suspense fallback={null}>
        <GithubSettings />
      </React.Suspense>

      <p className="text-sm text-foreground-secondary">
        Looking for your repositories?{" "}
        <Link href="/repos" className="text-brand underline-offset-4 hover:underline">
          Go to Repositories
        </Link>
      </p>
    </div>
  );
}
