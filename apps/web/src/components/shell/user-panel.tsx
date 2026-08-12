"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth-context";

function initialsFor(email: string): string {
  // The API only exposes an email, so the local part is all there is to work
  // with for an avatar.
  const [localPart] = email.split("@");
  const letters = localPart.replace(/[^a-zA-Z0-9]/g, "");
  return (letters.slice(0, 2) || "?").toUpperCase();
}

export function UserPanel() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [isSigningOut, setIsSigningOut] = React.useState(false);

  async function handleLogout() {
    setIsSigningOut(true);
    await logout();
    router.replace("/login");
  }

  if (!user) return null;

  return (
    <div className="space-y-3 border-t border-subtle pt-4">
      <div className="flex items-center gap-3">
        <Avatar className="size-8">
          <AvatarFallback>{initialsFor(user.email)}</AvatarFallback>
        </Avatar>
        {/* min-w-0 lets the email truncate instead of forcing the sidebar wider. */}
        <p className="min-w-0 flex-1 truncate text-sm text-foreground-secondary" title={user.email}>
          {user.email}
        </p>
      </div>

      <div className="flex items-center gap-1">
        <ThemeToggle />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              onClick={handleLogout}
              disabled={isSigningOut}
            >
              <LogOut />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isSigningOut ? "Signing out…" : "Sign out"}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
