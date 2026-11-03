"use client";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ContextSelector } from "./ContextSelector";
import type { ComponentProps } from "react";

type SelectorProps = ComponentProps<typeof ContextSelector>;

/**
 * The Data context picker in a sheet, for widths where it isn't docked beside
 * the chat. Loaded on first open (keeps Radix Dialog out of the panel chunk).
 */
export default function ContextSheet({
  open,
  onOpenChange,
  side,
  ...selector
}: SelectorProps & { open: boolean; onOpenChange: (open: boolean) => void; side: "bottom" | "right" }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        showCloseButton={false}
        // Focusing the search field on a phone pops the keyboard over the sheet.
        onOpenAutoFocus={(e) => {
          if (window.matchMedia?.("(pointer: coarse)").matches) e.preventDefault();
        }}
        className={
          side === "bottom"
            ? "max-h-[85dvh] rounded-t-3xl pb-[env(safe-area-inset-bottom)]"
            : "w-full max-w-sm sm:max-w-sm"
        }
      >
        <SheetTitle className="sr-only">Data context</SheetTitle>
        <SheetDescription className="sr-only">Choose which ad accounts and campaigns the AI Analyst reads.</SheetDescription>
        <ContextSelector {...selector} className="min-h-0 flex-1" />
        <div className="border-t p-3">
          <Button className="w-full" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
