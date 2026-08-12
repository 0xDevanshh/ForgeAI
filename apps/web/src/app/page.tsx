"use client";

import { AgentTag, type AgentType } from "@/components/agent-tag";
import { StreamingIndicator } from "@/components/streaming-indicator";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const SURFACES = [
  { name: "--bg-base", cls: "bg-canvas", note: "page canvas" },
  { name: "--bg-surface", cls: "bg-surface", note: "cards, panels" },
  { name: "--bg-elevated", cls: "bg-elevated", note: "modals, dropdowns" },
  { name: "--border-subtle", cls: "bg-subtle", note: "default hairline" },
  { name: "--border-strong", cls: "bg-strong", note: "inputs, emphasis" },
];

const STATUS = [
  { name: "--accent", cls: "bg-brand", note: "primary actions" },
  { name: "--success", cls: "bg-success", note: "index complete" },
  { name: "--warning", cls: "bg-warning", note: "answer may be incomplete" },
  { name: "--danger", cls: "bg-danger", note: "index failed" },
];

const TYPE_SCALE = [
  { token: "--text-4xl", cls: "text-4xl", px: "48.83px" },
  { token: "--text-3xl", cls: "text-3xl", px: "39.06px" },
  { token: "--text-2xl", cls: "text-2xl", px: "31.25px" },
  { token: "--text-xl", cls: "text-xl", px: "25px" },
  { token: "--text-lg", cls: "text-lg", px: "20px" },
  { token: "--text-base", cls: "text-base", px: "16px" },
  { token: "--text-sm", cls: "text-sm", px: "14px" },
  { token: "--text-xs", cls: "text-xs", px: "12px" },
];

const AGENTS: AgentType[] = [
  "architecture",
  "bug_investigation",
  "pr_summary",
  "documentation",
];

function Section({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl">{title}</h2>
        <p className="text-sm text-foreground-secondary">{caption}</p>
      </div>
      {children}
    </section>
  );
}

export default function DesignSystemPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <header className="animate-enter mb-16 flex items-start justify-between gap-6">
        <div className="space-y-3">
          <span className="font-mono text-xs uppercase tracking-wide text-foreground-muted">
            Design system
          </span>
          <h1 className="text-3xl">Blueprint</h1>
          <p className="max-w-measure text-foreground-secondary">
            The visual language for AI Codebase Copilot — an architect&rsquo;s
            workspace: structured, gridded, quietly confident. Every screen
            references these tokens; no ad-hoc colors or spacing.
          </p>
        </div>
        <ThemeToggle />
      </header>

      <div className="space-y-16">
        <Section title="Surfaces" caption="A three-step ladder, separated by 1px borders rather than shadows.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {SURFACES.map((s) => (
              <div key={s.name} className="space-y-2">
                <div
                  className={`h-16 rounded-md border border-subtle ${s.cls}`}
                />
                <div className="space-y-0.5">
                  <p className="font-mono text-xs text-foreground">{s.name}</p>
                  <p className="text-xs text-foreground-muted">{s.note}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Accent & status" caption="Used sparingly — the accent marks primary actions and active state, nothing else.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STATUS.map((s) => (
              <div key={s.name} className="space-y-2">
                <div className={`h-16 rounded-md ${s.cls}`} />
                <div className="space-y-0.5">
                  <p className="font-mono text-xs text-foreground">{s.name}</p>
                  <p className="text-xs text-foreground-muted">{s.note}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Typography" caption="Instrument Sans for display, Geist for UI, Geist Mono for anything technical. 1.25 scale.">
          <Card>
            <CardContent className="divide-y divide-subtle p-0">
              {TYPE_SCALE.map((t) => (
                <div
                  key={t.token}
                  className="flex items-baseline justify-between gap-6 px-6 py-4"
                >
                  <span className={`${t.cls} truncate font-display`}>
                    Grounded answers
                  </span>
                  <span className="shrink-0 font-mono text-xs text-foreground-muted">
                    {t.token} · {t.px}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
          <p className="max-w-measure text-foreground-secondary">
            Body copy relaxes to a 1.6 line-height and caps at{" "}
            <code className="text-foreground">--measure</code> (768px), because
            long AI responses stretched edge-to-edge are genuinely harder to
            read. File paths like{" "}
            <code className="text-foreground">app/graph/builder.py</code> and
            SHAs like <code className="text-foreground">5530b13</code> take
            monospace — here it carries meaning, it isn&rsquo;t decoration.
          </p>
        </Section>

        <Section title="Agent indicators" caption="Code-editor gutter markers, not emoji pills. The signature component.">
          <div className="flex flex-wrap gap-3">
            {AGENTS.map((a) => (
              <AgentTag key={a} agent={a} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <StreamingIndicator label="Retrieving context" />
            <StreamingIndicator label="Reviewing answer" />
          </div>
        </Section>

        <Section title="Controls" caption="Restrained radii, no resting shadows, one consistent focus ring.">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Index repository</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Delete</Button>
            <Button variant="link">Link</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Input placeholder="Ask about your codebase…" className="max-w-sm" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline">Hover me</Button>
              </TooltipTrigger>
              <TooltipContent>Quiet, not a blue chip</TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">Menu</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Repository</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Re-index</DropdownMenuItem>
                <DropdownMenuItem>Settings</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">Dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete repository</DialogTitle>
                  <DialogDescription>
                    This removes the index and every chat session attached to
                    it. This can&rsquo;t be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline">Cancel</Button>
                  <Button variant="destructive">Delete</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="success" shape="pill">
              Indexed
            </Badge>
            <Badge variant="warning" shape="pill">
              May be incomplete
            </Badge>
            <Badge variant="danger" shape="pill">
              Failed
            </Badge>
          </div>
        </Section>

        <Section title="Composition" caption="Tabs, cards, and loading state working together.">
          <Tabs defaultValue="answer">
            <TabsList>
              <TabsTrigger value="answer">Answer</TabsTrigger>
              <TabsTrigger value="sources">Sources</TabsTrigger>
              <TabsTrigger value="trace">Trace</TabsTrigger>
            </TabsList>
            <TabsContent value="answer">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <CardTitle>How does the reviewer loop work?</CardTitle>
                    <AgentTag agent="architecture" />
                  </div>
                  <CardDescription>
                    Grounded in 8 chunks across 3 files
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="max-w-measure text-foreground-secondary">
                    The reviewer node checks each answer against the same
                    retrieved chunks the agent used, then routes back to
                    whichever agent produced it — capped at three attempts.
                  </p>
                  <Separator />
                  <StreamingIndicator label="Streaming" />
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="sources">
              <Card>
                <CardContent className="space-y-3 p-6">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-1/2" />
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="trace">
              <Card>
                <CardContent className="p-6">
                  <p className="font-mono text-xs text-foreground-secondary">
                    planner → architecture_agent → reviewer → END
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </Section>
      </div>
    </main>
  );
}
