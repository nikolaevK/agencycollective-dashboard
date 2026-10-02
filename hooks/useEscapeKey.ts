"use client";

import { useEffect, useRef } from "react";

/**
 * Nesting-aware Escape handling for drawers, modals and popovers.
 *
 * Every enabled caller registers on a module-level stack; on Escape only the
 * TOPMOST (most recently enabled) layer reacts. Before this, each overlay put
 * its own document listener up, so a single Escape aimed at a dropdown inside
 * the invoice drawer also closed the drawer — and threw away the edits.
 */
const stack: symbol[] = [];

export function useEscapeKey(onEscape: () => void, enabled = true): void {
  const callback = useRef(onEscape);
  callback.current = onEscape;

  useEffect(() => {
    if (!enabled) return;
    const id = Symbol("escape-layer");
    stack.push(id);
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (stack[stack.length - 1] !== id) return;
      callback.current();
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      const idx = stack.indexOf(id);
      if (idx >= 0) stack.splice(idx, 1);
    };
  }, [enabled]);
}
