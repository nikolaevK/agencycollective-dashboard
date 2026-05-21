"use client";

import { useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Mobile-only filter UI for the calendar pages. The desktop's wrap-or-die
// pill rows would eat 60% of a phone screen (one pill per row for long
// labels like email addresses). On mobile we collapse all filter groups
// behind a "Filters" button that opens a dialog; the desktop view stays
// untouched.
//
// Active-filter count badge shows on the trigger so users know at a
// glance whether the calendar is filtered.

interface Props {
  /** Total filter count visualized on the trigger pill ("(2)"). 0 hides it. */
  activeCount: number;
  /** Pre-built filter sections (calendar-owner row, sub-account row, etc.)
   *  The caller owns layout; this component just provides the container. */
  children: ReactNode;
}

export function MobileFiltersSheet({ activeCount, children }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sm:hidden mt-3">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              activeCount > 0
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-foreground hover:bg-muted"
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {activeCount > 0 && (
              <span className="ml-0.5 inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 rounded-full bg-primary-foreground/20 text-[10px] font-bold tabular-nums">
                {activeCount}
              </span>
            )}
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Filters</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">{children}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
