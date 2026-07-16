import { cn } from "@/lib/utils";

/**
 * Single source of truth for deal-status chips — four component-local copies
 * had already drifted apart in label ("Pending" vs "Pending Signature") and
 * size. `compact` renders the short-label variant used in the closer/setter
 * portal lists.
 */
export const DEAL_STATUS_STYLES: Record<string, string> = {
  closed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  not_closed: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  pending_signature: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  rescheduled: "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
  follow_up: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
};

const FULL_LABELS: Record<string, string> = {
  closed: "Closed",
  not_closed: "Not Closed",
  pending_signature: "Pending Signature",
  rescheduled: "Rescheduled",
  follow_up: "Follow Up",
};

const COMPACT_LABELS: Record<string, string> = {
  ...FULL_LABELS,
  pending_signature: "Pending",
};

export function DealStatusBadge({
  status,
  compact,
}: {
  status: string;
  compact?: boolean;
}) {
  const labels = compact ? COMPACT_LABELS : FULL_LABELS;
  return (
    <span
      className={cn(
        "inline-flex items-center shrink-0 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide whitespace-nowrap",
        compact ? "text-[10px]" : "text-[9px]",
        DEAL_STATUS_STYLES[status] ?? DEAL_STATUS_STYLES.follow_up
      )}
    >
      {labels[status] ?? status}
    </span>
  );
}
