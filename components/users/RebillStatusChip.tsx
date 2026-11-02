import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import type { RebillStatus } from "@/lib/clientBilling";

// Subtle status tones (same family as the Overview's re-bill bar): overdue =
// late, due = needs billing, sent = awaiting payment, the rest are calm.
export const REBILL_STATUS_META: Record<RebillStatus, { label: string; tone: BadgeTone }> = {
  overdue: { label: "Overdue", tone: "danger" },
  due: { label: "Due soon", tone: "warning" },
  invoice_sent: { label: "Invoice sent", tone: "info" },
  upcoming: { label: "Upcoming", tone: "neutral" },
  paused: { label: "Paused", tone: "neutral" },
  extended: { label: "Extended", tone: "neutral" },
  unscheduled: { label: "Unscheduled", tone: "neutral" },
};

/**
 * Re-bill schedule status pill. `paid` is a SEPARATE flag (the current cycle is
 * settled) — when true a green "Paid" pill renders alongside the status pill, so
 * a row can show e.g. "Paid" + "Upcoming". They're independent: a re-bill can be
 * upcoming and not paid.
 */
export function RebillStatusChip({
  status,
  paid,
  className,
}: {
  status: RebillStatus;
  paid?: boolean;
  className?: string;
}) {
  const s = REBILL_STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1.5">
      {paid && <StatusBadge tone="success">Paid</StatusBadge>}
      <StatusBadge tone={s.tone} className={className}>
        {s.label}
      </StatusBadge>
    </span>
  );
}
