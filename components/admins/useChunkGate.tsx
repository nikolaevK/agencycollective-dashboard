"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/providers/ToastProvider";

/**
 * Click-to-open UI that lives in its own chunk (next/dynamic) loads that chunk
 * BEFORE it opens: a slow network shows a "Loading…" pill instead of a dead
 * click, and a chunk that fails (stale deploy, offline) shows a toast instead
 * of crashing the page through next/dynamic. Clicking again retries — webpack
 * forgets a failed chunk.
 *
 *   const { gate, pending } = useChunkGate();
 *   if (!(await gate(loadMyModal))) return;   // then open it
 *   …and render `pending` once.
 */
export function useChunkGate() {
  const { toastError } = useToast();
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);

  async function gate(load: () => Promise<unknown>): Promise<boolean> {
    // A second click while the first load is in flight does nothing.
    if (busy.current) return false;
    busy.current = true;
    setLoading(true);
    try {
      await load();
      return true;
    } catch {
      toastError("Couldn't load this — check your connection and try again.");
      return false;
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  // The live region stays mounted so "Loading…" is announced when it fills.
  // Above the Radix dialogs (z-[90]) a gate can run from, below toasts.
  const pending = (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-1/2 z-[95] flex -translate-y-1/2 justify-center"
    >
      {loading && (
        <span className="flex items-center gap-2 rounded-4xl bg-popover px-4 py-2.5 text-sm text-popover-foreground shadow-xl ring-1 ring-foreground/5 dark:ring-foreground/10">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
          Loading…
        </span>
      )}
    </div>
  );

  return { gate, pending };
}
