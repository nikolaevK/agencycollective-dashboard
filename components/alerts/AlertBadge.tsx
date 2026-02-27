import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

interface AlertBadgeProps {
  count: number;
  criticalCount?: number;
  className?: string;
}

export function AlertBadge({ count, criticalCount = 0, className }: AlertBadgeProps) {
  if (count === 0) {
    return (
      <div className={cn("flex items-center gap-1.5 text-muted-foreground", className)}>
        <Bell className="h-4 w-4" />
        <span className="text-xs">No alerts</span>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <div className="relative">
        <Bell className="h-4 w-4 text-muted-foreground" />
        {count > 0 && (
          <span
            className={cn(
              "absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white",
              criticalCount > 0 ? "bg-red-500" : "bg-yellow-400 text-yellow-900"
            )}
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </div>
      <span className="text-xs font-medium">
        {count} alert{count !== 1 ? "s" : ""}
      </span>
    </div>
  );
}
