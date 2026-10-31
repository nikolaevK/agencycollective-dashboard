"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
      <span className="text-xs font-medium text-muted-foreground mr-1">
        Source
      </span>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={value}
        // Radix reports "" when the active pill is clicked again; a source
        // filter can't be deselected, so ignore that.
        onValueChange={(v) => {
          if (v) onChange(v as SubAccountFilterValue);
        }}
        aria-label="Source"
        className="flex-wrap justify-start"
      >
        <ToggleGroupItem value="all" className="px-3 text-xs">
          All ({counts.all})
        </ToggleGroupItem>
        {subBuckets.map(({ sub, count }) => (
          <ToggleGroupItem key={sub.id} value={sub.id} className="gap-1.5 px-3 text-xs">
            <Badge
              variant="outline"
              className={cn("h-4 px-1 text-[9px] font-semibold", sub.badgeClass)}
            >
              {sub.shortLabel}
            </Badge>
            {sub.label} ({count})
          </ToggleGroupItem>
        ))}
        {counts.nonGhl > 0 && (
          <ToggleGroupItem value="non-ghl" className="px-3 text-xs">
            Non-GHL ({counts.nonGhl})
          </ToggleGroupItem>
        )}
      </ToggleGroup>
    </div>
  );
}
