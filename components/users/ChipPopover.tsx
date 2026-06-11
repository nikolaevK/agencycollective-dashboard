"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Small popover anchored to a trigger element, rendered through a portal with
 * fixed positioning so it isn't clipped by the directory table's
 * overflow-x-auto scroll container. Closes on outside click, Escape, scroll
 * and resize (the anchor moves under it).
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
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const r = anchor.getBoundingClientRect();
    const left = Math.min(r.left, window.innerWidth - width - 12);
    // Flip above the anchor when there's no room below.
    const spaceBelow = window.innerHeight - r.bottom;
    const top = spaceBelow < 260 && r.top > 280 ? Math.max(8, r.top - 264) : r.bottom + 4;
    setPos({ top, left: Math.max(8, left) });
  }, [anchor, width]);

  useEffect(() => {
    function handlePointer(e: MouseEvent) {
      const t = e.target as Node;
      if (popRef.current && !popRef.current.contains(t) && !anchor.contains(t)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    // Any scroll (incl. the table's horizontal scroll) shifts the anchor away
    // from the fixed-position popover — close rather than drift.
    function handleScroll(e: Event) {
      if (popRef.current && e.target instanceof Node && popRef.current.contains(e.target)) {
        return; // scrolling inside the popover itself is fine
      }
      onClose();
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [anchor, onClose]);

  if (typeof document === "undefined" || !pos) return null;

  return createPortal(
    <div
      ref={popRef}
      className="fixed z-[70] rounded-lg border border-border bg-popover shadow-xl py-1 max-h-64 overflow-y-auto animate-in fade-in-0 zoom-in-95 duration-100"
      style={{ top: pos.top, left: pos.left, width }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}
