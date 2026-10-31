"use client";

import { useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
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
          <Button
            type="button"
            variant={activeCount > 0 ? "default" : "outline"}
            size="sm"
          >
            <SlidersHorizontal className="size-3.5" />
            Filters
            {activeCount > 0 && (
              <span className="ml-0.5 inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 rounded-full bg-primary-foreground/20 text-[10px] font-semibold tabular-nums">
                {activeCount}
              </span>
            )}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
          <DialogHeader>
            <DialogTitle>Filters</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">{children}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
