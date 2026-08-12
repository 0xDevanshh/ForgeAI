import { MessagesSquare } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export const metadata = {
  title: "Chat · Codebase Copilot",
};

export default function ChatPage() {
  return (
    // Reading column, not the wider list width — answers are long-form prose.
    <div className="mx-auto max-w-measure space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl">Chat</h1>
        <p className="text-foreground-secondary">
          Ask a question about an indexed repository.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-4 px-6 py-16 text-center">
          <MessagesSquare className="size-6 text-foreground-muted" aria-hidden />
          <div className="space-y-1">
            <p className="font-medium text-foreground">No conversation yet</p>
            <p className="text-sm text-foreground-secondary">
              Index a repository first, then come back here to ask about it.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
