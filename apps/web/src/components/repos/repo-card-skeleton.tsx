import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors RepoCard's layout (name, language tags, status row, action bar) so
 * the grid doesn't reflow when real data arrives — a centred spinner would
 * collapse the layout and feel slower even at identical latency.
 */
export function RepoCardSkeleton() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="space-y-3">
          <Skeleton className="h-5 w-3/4" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-20" />
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-4 w-32" />
          <div className="border-t border-subtle pt-3">
            <Skeleton className="h-8 w-40" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function RepoGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <RepoCardSkeleton key={index} />
      ))}
    </div>
  );
}
