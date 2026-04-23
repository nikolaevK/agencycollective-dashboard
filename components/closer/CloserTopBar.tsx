"use client";

import { Menu } from "lucide-react";
import type { CloserRole } from "@/lib/closers";
import { ThemeToggle } from "@/components/ui/theme-toggle";

interface CloserTopBarProps {
  displayName?: string;
  role?: CloserRole;
  onMenuClick?: () => void;
}

export function CloserTopBar({ displayName, role, onMenuClick }: CloserTopBarProps) {
  const isSetter = role === "setter";
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-card px-4 md:px-6 gap-2">
      {/* Left: hamburger (mobile) + name */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onMenuClick}
          className="md:hidden flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>

        {displayName && (
          <span className="text-sm font-semibold text-foreground truncate">
            {displayName}
          </span>
        )}

        <span className="hidden sm:inline-flex shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
          {isSetter ? "Setter Portal" : "Closer Portal"}
        </span>
      </div>

      {/* Right: theme toggle */}
      <div className="flex shrink-0 items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}
