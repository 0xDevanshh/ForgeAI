import Link from "next/link";

import { SidebarNav } from "@/components/shell/sidebar-nav";
import { UserPanel } from "@/components/shell/user-panel";

/**
 * Shared by the fixed desktop sidebar and the mobile slide-over, so the two
 * can never drift apart. `onNavigate` lets the drawer close itself on a tap.
 */
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6">
      <Link
        href="/repos"
        onClick={onNavigate}
        className="font-display text-base font-semibold tracking-tight text-foreground"
      >
        Codebase Copilot
      </Link>

      <div className="flex-1 overflow-y-auto">
        <SidebarNav onNavigate={onNavigate} />
      </div>

      <UserPanel />
    </div>
  );
}

/** Desktop sidebar: fixed 240px, surface fill, hairline right border. */
export function Sidebar() {
  return (
    <aside className="hidden w-sidebar shrink-0 border-r border-subtle bg-surface p-4 md:flex md:flex-col">
      <SidebarContent />
    </aside>
  );
}
