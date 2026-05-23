import { cn } from "@/lib/utils";
import type { RebillStatus } from "@/lib/clientBilling";

const STYLES: Record<RebillStatus, { label: string; cls: string }> = {
  overdue: {
    label: "Overdue",
    cls: "bg-red-500/10 text-red-600 dark:text-red-400",
  },
  due: {
    label: "Due soon",
    cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  upcoming: {
    label: "Upcoming",
    cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
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

export function RebillStatusChip({
  status,
  className,
}: {
  status: RebillStatus;
  className?: string;
}) {
  const s = STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap",
        s.cls,
        className
      )}
    >
      {s.label}
    </span>
  );
}
