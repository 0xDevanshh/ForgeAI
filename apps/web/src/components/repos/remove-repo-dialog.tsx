"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Repo } from "@/lib/repos";

export function RemoveRepoDialog({
  repo,
  onOpenChange,
  onConfirm,
  isRemoving,
}: {
  repo: Repo | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isRemoving: boolean;
}) {
  return (
    <Dialog open={repo !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-form">
        <DialogHeader>
          <DialogTitle>Remove {repo?.fullName}?</DialogTitle>
          <DialogDescription>
            This deletes its index. You can add it again later — nothing is
            removed from GitHub.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isRemoving}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isRemoving}>
            {isRemoving ? "Removing…" : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
