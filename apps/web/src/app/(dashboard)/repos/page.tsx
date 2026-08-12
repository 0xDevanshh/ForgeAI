import { FolderGit2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = {
  title: "Repositories · Codebase Copilot",
};

export default function ReposPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl">Repositories</h1>
          <p className="text-foreground-secondary">
            Connect a repository to index it and start asking questions.
          </p>
        </div>
        <Button>Add repository</Button>
      </div>

      {/* Empty state until the repo list screen lands. */}
      <Card>
        <CardContent className="flex flex-col items-center gap-4 px-6 py-16 text-center">
          <FolderGit2 className="size-6 text-foreground-muted" aria-hidden />
          <div className="max-w-measure space-y-1">
            <p className="font-medium text-foreground">No repositories yet</p>
            <p className="text-sm text-foreground-secondary">
              Once you connect one, indexing starts automatically and you can ask
              questions as soon as it finishes.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
