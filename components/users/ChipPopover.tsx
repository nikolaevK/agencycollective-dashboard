"use client";

import { useRef, type ReactNode } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

/**
 * Small popover anchored to a trigger element. Rendered as a kit (Radix)
 * Popover in a portal, so it isn't clipped by the directory table's
 * overflow-x-auto scroll container and follows the anchor when that container
 * scrolls (hidden while the anchor is scrolled out of view). Closes on outside
 * click and Escape; a click on the anchor itself is left to the anchor's own
 * toggle handler.
 */
export function ChipPopover({
  anchor,
  onClose,
  children,
  width = 230,
}: {
  anchor: HTMLElement;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  const anchorRef = useRef<HTMLElement>(anchor);
  anchorRef.current = anchor;

  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <PopoverAnchor virtualRef={anchorRef} />
      <PopoverContent
        align="start"
        collisionPadding={8}
        hideWhenDetached
        // Focus stays on the anchor, as before (no focus jump into the list).
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          // The anchor toggles the popover itself — don't close-then-reopen.
          if (e.target instanceof Node && anchor.contains(e.target)) e.preventDefault();
        }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-64 overflow-y-auto p-1.5"
        style={{ width }}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
