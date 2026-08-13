import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * An invitation, not a void: the blueprint texture and a drawn placeholder
 * card make the space feel like a workspace waiting for work, rather than a
 * blank box reporting absence.
 */
export function ReposEmptyState({
  onAdd,
  canAdd,
}: {
  onAdd: () => void;
  canAdd: boolean;
}) {
  return (
    <Card className="bp-dots relative overflow-hidden">
      <CardContent className="flex flex-col items-center gap-6 px-6 py-16 text-center">
        <svg
          viewBox="0 0 220 120"
          role="presentation"
          aria-hidden
          className="h-auto w-full max-w-xs text-strong"
        >
          {/* A repo card sketched in construction lines — the shape of what
              will fill this space. */}
          <rect
            x="1"
            y="1"
            width="218"
            height="118"
            rx="10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="6 5"
          />
          <rect x="24" y="28" width="120" height="8" rx="4" fill="currentColor" opacity="0.65" />
          <rect x="24" y="52" width="44" height="14" rx="4" fill="currentColor" opacity="0.4" />
          <rect x="74" y="52" width="38" height="14" rx="4" fill="currentColor" opacity="0.4" />
          <rect x="24" y="84" width="172" height="3" rx="1.5" fill="currentColor" opacity="0.3" />
        </svg>

        <div className="max-w-measure space-y-1">
          <p className="font-medium text-foreground">No repositories yet.</p>
          <p className="text-sm text-foreground-secondary">
            Add your first repository to get started.
          </p>
        </div>

        <Button onClick={onAdd} disabled={!canAdd}>
          Add repository
        </Button>
      </CardContent>
    </Card>
  );
}
