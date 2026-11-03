"use client";

import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

/**
 * Side panel on small screens: the campaign picker (left) and the ad preview
 * (right) live in columns on wide screens and in this sheet below lg / xl.
 * Loaded with next/dynamic by AdCopyGenerator — only fetched on first open.
 */
export function PanelSheet({
  open,
  onOpenChange,
  side,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side: "left" | "right";
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={side} className="w-[92vw] p-0 sm:max-w-md">
        <SheetTitle className="sr-only">{title}</SheetTitle>
        <SheetDescription className="sr-only">{description}</SheetDescription>
        <div className="flex min-h-0 flex-1 flex-col pt-10">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
