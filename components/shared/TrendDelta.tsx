"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn, percentChange } from "@/lib/utils";

interface Props {
  current: number;
  /** Value in the previous same-length period. Undefined/null → no chip. */
  previous: number | null | undefined;
  /** "percent": relative change. "pp": absolute percentage-point diff (for
   *  rates, where relative change misleads). */
  mode?: "percent" | "pp";
  /** When true, a decrease is rendered green (e.g. outstanding balance). */
  lowerIsBetter?: boolean;
}

/**
 * Compact Δ-vs-previous-period chip for metric cards. Hides itself when
 * there is no previous bucket or both periods are zero; shows "new" when
 * something appeared from a zero baseline (a % of zero is meaningless).
 */
export function TrendDelta({ current, previous, mode = "percent", lowerIsBetter }: Props) {
  if (previous == null) return null;
  if (previous === 0 && current === 0) return null;

  let text: string;
  let direction: "up" | "down" | "flat";

  if (mode === "pp") {
    const diff = Math.round((current - previous) * 10) / 10;
    direction = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
    text = `${diff > 0 ? "+" : ""}${diff} pp`;
  } else {
    // percentChange returns null when previous === 0 — a % of zero is
    // meaningless, so render a neutral "new" chip instead.
    const raw = percentChange(current, previous);
    if (raw === null) {
      return (
        <span
          className="inline-flex items-center gap-0.5 rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
          title="No activity in the previous period"
        >
          new
        </span>
      );
    }
    const pct = Math.round(raw * 10) / 10;
    direction = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
    text = `${pct > 0 ? "+" : ""}${pct}%`;
  }

  const positive = lowerIsBetter ? direction === "down" : direction === "up";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
        direction === "flat"
          ? "bg-muted/60 text-muted-foreground"
          : positive
            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            : "bg-red-500/10 text-red-700 dark:text-red-400"
      )}
      title="vs previous period of the same length"
    >
      {direction === "up" && <ArrowUpRight className="h-3 w-3" />}
      {direction === "down" && <ArrowDownRight className="h-3 w-3" />}
      {text}
    </span>
  );
}
