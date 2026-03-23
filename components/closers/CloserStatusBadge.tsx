import { cn } from "@/lib/utils";
import type { CloserStatus } from "@/lib/closers";

const STATUS_CONFIG: Record<CloserStatus, { label: string; dotCls: string; badgeCls: string }> = {
  active: {
    label: "Active",
    dotCls: "bg-emerald-500",
    badgeCls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  },
  inactive: {
    label: "Inactive",
    dotCls: "bg-gray-400",
    badgeCls: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400",
  },
};

export function CloserStatusBadge({ status }: { status: CloserStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide",
        config.badgeCls
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", config.dotCls)} />
      {config.label}
    </span>
  );
}
