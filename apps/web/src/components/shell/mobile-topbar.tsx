"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { SidebarContent } from "@/components/shell/sidebar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/**
 * Below md the sidebar becomes a slide-over drawer behind this bar. The bar is
 * sticky so the trigger stays reachable however far the content scrolls.
 */
export function MobileTopbar() {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  // Belt-and-braces alongside SidebarContent's onNavigate: a route change from
  // anywhere (back button, redirect) should never leave the drawer hanging open.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-subtle bg-surface px-4 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open navigation">
            <Menu />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-sidebar p-4">
          {/* Radix requires a title for the dialog's accessible name; it's
              visually redundant next to the wordmark, so it's screen-reader only. */}
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <span className="font-display text-sm font-semibold tracking-tight text-foreground">
        Codebase Copilot
      </span>
    </header>
  );
}
