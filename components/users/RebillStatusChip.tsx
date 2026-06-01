import { cn } from "@/lib/utils";
import type { RebillStatus } from "@/lib/clientBilling";

const BASE =
  "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap";

const STYLES: Record<RebillStatus, { label: string; cls: string }> = {
  overdue: {
    label: "Overdue",
    cls: "bg-red-500/10 text-red-600 dark:text-red-400",
  },
  due: {
    label: "Due soon",
    cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  invoice_sent: {
    label: "Invoice sent",
    cls: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  upcoming: {
    label: "Upcoming",
    cls: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
  paused: {
    label: "Paused",
    cls: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  },
  extended: {
    label: "Extended",
    cls: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  unscheduled: {
    label: "Unscheduled",
    cls: "bg-muted text-muted-foreground",
  },
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
  const s = STYLES[status];
  return (
    <span className="inline-flex items-center gap-1.5">
      {paid && (
        <span className={cn(BASE, "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400")}>
          Paid
        </span>
      )}
      <span className={cn(BASE, s.cls, className)}>{s.label}</span>
    </span>
  );
}
