"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

/** The popover's options: its enabled buttons, in DOM order. */
function optionsIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>("button:not(:disabled)"));
}

function isSelected(el: HTMLElement): boolean {
  return (
    el.getAttribute("aria-pressed") === "true" ||
    el.getAttribute("aria-checked") === "true" ||
    el.getAttribute("aria-selected") === "true"
  );
}

/**
 * Small popover anchored to a trigger element. Rendered as a kit (Radix)
 * Popover in a portal, so it isn't clipped by the directory table's
 * overflow-x-auto scroll container and follows the anchor when that container
 * scrolls (hidden while the anchor is scrolled out of view). Closes on outside
 * click and Escape; a click on the anchor itself is left to the anchor's own
 * toggle handler.
 *
 * Keyboard: opening moves focus to the selected option (aria-pressed /
 * -checked / -selected), else the first one; ↑/↓ (Home/End) move between the
 * options, Enter/Space pick (native buttons), Tab cycles inside, Escape closes.
 * Focus returns to the anchor when the popover closes from inside (Escape or a
 * pick) — not when the user clicked or focused something else on the page.
 */
export function ChipPopover({
  anchor,
  onClose,
  children,
  width = 230,
  label,
}: {
  anchor: HTMLElement;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  /** Accessible name for the popover (role="dialog"). */
  label?: string;
}) {
  const anchorRef = useRef<HTMLElement>(anchor);
  anchorRef.current = anchor;
  const interactedOutside = useRef(false);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    // Arrows/Home/End inside a text field (e.g. "New option…") stay the field's.
    if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable='true']")) return;
    const options = optionsIn(e.currentTarget);
    if (options.length === 0) return;
    e.preventDefault();
    const i = options.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? options.length - 1
          : e.key === "ArrowDown"
            ? (i + 1) % options.length
            : i <= 0
              ? options.length - 1
              : i - 1;
    options[next].focus();
  }

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
        aria-label={label}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          const container = e.currentTarget as HTMLElement;
          const options = optionsIn(container);
          // preventScroll: the content is still unpositioned on mount.
          (options.find(isSelected) ?? options[0] ?? container).focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          const el = anchorRef.current;
          if (!interactedOutside.current && el.isConnected) el.focus({ preventScroll: true });
        }}
        onInteractOutside={(e) => {
          // The anchor toggles the popover itself — don't close-then-reopen.
          if (e.target instanceof Node && anchor.contains(e.target)) e.preventDefault();
          else interactedOutside.current = true;
        }}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[min(22rem,var(--radix-popover-content-available-height))] overflow-y-auto p-1.5"
        style={{ width }}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
