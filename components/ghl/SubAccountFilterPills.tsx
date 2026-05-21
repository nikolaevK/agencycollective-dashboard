"use client";

import { cn } from "@/lib/utils";
import { SUB_ACCOUNTS, type GhlSubAccountId } from "@/lib/ghl/subAccounts";

// Filter value for the calendar's "show events from which CRM source"
// chip row. "all" is the default; sub-account ids narrow to one CRM;
// "non-ghl" surfaces events with no GHL counterpart (manual Google
// calendar entries, holdovers from before sync was wired up, etc.).
export type SubAccountFilterValue = "all" | GhlSubAccountId | "non-ghl";

interface Counts {
  all: number;
  bySub: Partial<Record<GhlSubAccountId, number>>;
  nonGhl: number;
}

interface Props {
  value: SubAccountFilterValue;
  onChange: (v: SubAccountFilterValue) => void;
  counts: Counts;
}

/**
 * Pill row for filtering the calendar by GHL sub-account.
 *
 * Only renders when there's something meaningful to filter. If every event
 * is non-GHL (or every event is in one sub-account and there are no
 * non-GHL events), the row is hidden — the user has no decision to make.
 *
 * Sub-account buttons are suppressed individually when their count is 0
 * for the current view (e.g., this week only had Agency calls → hide the
 * Peptide button). All-zero counts shouldn't happen because we'd have
 * returned null at the top.
 */
export function SubAccountFilterPills({ value, onChange, counts }: Props) {
  const subBuckets = SUB_ACCOUNTS.map((s) => ({
    sub: s,
    count: counts.bySub[s.id] ?? 0,
  })).filter((b) => b.count > 0);

  // Hide the whole row unless there's at least one GHL event AND at least
  // one other bucket (another sub-account or non-GHL events) to compare
  // against. Single-bucket views have nothing to filter.
  const totalBuckets = subBuckets.length + (counts.nonGhl > 0 ? 1 : 0);
  if (subBuckets.length === 0 || totalBuckets < 2) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap mt-3">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mr-1">
        Source
      </span>
      <button
        type="button"
        onClick={() => onChange("all")}
        className={pillCls(value === "all")}
      >
        All ({counts.all})
      </button>
      {subBuckets.map(({ sub, count }) => (
        <button
          key={sub.id}
          type="button"
          onClick={() => onChange(sub.id)}
          className={cn(pillCls(value === sub.id), "gap-1.5")}
        >
          <span
            className={cn(
              "inline-flex items-center justify-center rounded px-1 py-0 text-[9px] font-bold border",
              sub.badgeClass
            )}
          >
            {sub.shortLabel}
          </span>
          {sub.label} ({count})
        </button>
      ))}
      {counts.nonGhl > 0 && (
        <button
          type="button"
          onClick={() => onChange("non-ghl")}
          className={pillCls(value === "non-ghl")}
        >
          Non-GHL ({counts.nonGhl})
        </button>
      )}
    </div>
  );
}

function pillCls(active: boolean): string {
  return cn(
    "inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
    active
      ? "bg-primary text-primary-foreground"
      : "bg-muted/50 text-muted-foreground hover:text-foreground"
  );
}
