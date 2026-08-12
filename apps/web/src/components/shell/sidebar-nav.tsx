"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderGit2, MessagesSquare } from "lucide-react";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/repos", label: "Repositories", icon: FolderGit2 },
  { href: "/chat", label: "Chat", icon: MessagesSquare },
];

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-1" aria-label="Main">
      {NAV_ITEMS.map((item) => {
        // Matches nested routes too, so /repos/abc keeps "Repositories" active.
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              // The 2px left border is the code-editor active-line marker.
              // Inactive items reserve the same 2px as a transparent border so
              // the label never shifts when the active item changes.
              "flex items-center gap-3 border-l-2 py-2 pl-3 pr-2 text-sm transition-colors duration-base ease-out",
              isActive
                ? "border-brand bg-accent font-medium text-foreground"
                : "border-transparent text-foreground-secondary hover:bg-accent hover:text-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
