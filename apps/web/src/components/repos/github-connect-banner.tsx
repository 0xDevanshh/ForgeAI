"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { startGithubConnect } from "@/lib/github";

export function GithubConnectBanner() {
  return (
    // Informational, not an alarm — a surface card rather than a red alert.
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="space-y-1">
          <p className="font-medium text-foreground">
            Connect your GitHub account to import repositories.
          </p>
          <p className="text-sm text-foreground-secondary">
            We only read the repositories you choose to index.
          </p>
        </div>
        <Button onClick={startGithubConnect}>Connect GitHub</Button>
      </CardContent>
    </Card>
  );
}
