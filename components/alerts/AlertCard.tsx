import {
  AlertTriangle,
  AlertCircle,
  Info,
  TrendingDown,
  TrendingUp,
  DollarSign,
  Percent,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { Alert } from "@/types/alerts";

const SEVERITY_STYLES = {
  critical: {
    circleBg: "bg-red-100 dark:bg-red-500/20",
    icon: AlertTriangle,
    iconColor: "text-red-600 dark:text-red-400",
    borderColor: "border-l-red-500",
  },
  warning: {
    circleBg: "bg-amber-100 dark:bg-amber-500/20",
    icon: AlertCircle,
    iconColor: "text-amber-600 dark:text-amber-400",
    borderColor: "border-l-amber-500",
  },
  info: {
    circleBg: "bg-violet-100 dark:bg-violet-500/20",
    icon: Sparkles,
    iconColor: "text-primary",
    borderColor: "border-l-violet-500",
  },
};

const TYPE_ICONS = {
  budget_pacing: DollarSign,
  ctr_drop: TrendingDown,
  cpc_spike: TrendingUp,
  roas_below_threshold: Percent,
  spend_anomaly: AlertCircle,
};

interface AlertCardProps {
  alert: Alert;
  compact?: boolean;
}

export function AlertCard({ alert, compact = false }: AlertCardProps) {
  const styles = SEVERITY_STYLES[alert.severity];
  const SeverityIcon = styles.icon;

  const actionLabel =
    alert.severity === "critical"
      ? "Fix Now"
      : alert.severity === "warning"
      ? "Investigate"
      : "Apply Recommendation";

  return (
    <div
      className={cn(
        "flex gap-4 p-4 rounded-xl bg-muted/40 dark:bg-muted/20 border border-border/30 dark:border-white/[0.04] group hover:shadow-md transition-all",
        "border-l-4 md:border-l-0",
        styles.borderColor,
        compact && "p-3"
      )}
    >
      {/* Icon circle */}
      <div className="shrink-0 mt-0.5">
        <div
          className={cn(
            "w-8 h-8 rounded-lg md:rounded-full flex items-center justify-center",
            styles.circleBg
          )}
        >
          <SeverityIcon className={cn("h-4 w-4", styles.iconColor)} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h5 className="text-sm font-bold text-foreground">{alert.title}</h5>

        {!compact && (
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">
            {alert.description}
          </p>
        )}

        {compact && (
          <p className="text-xs text-muted-foreground leading-relaxed mt-0.5 line-clamp-2">
            {alert.description}
          </p>
        )}

        {/* Action buttons — desktop only */}
        <div className="mt-2 hidden md:flex gap-3">
          <button className="text-[10px] font-black text-primary uppercase tracking-tight hover:underline">
            {actionLabel}
          </button>
          {alert.severity === "critical" && (
            <button className="text-[10px] font-black text-muted-foreground uppercase tracking-tight hover:underline">
              Dismiss
            </button>
          )}
        </div>

        {/* Time-ago stamp — mobile only */}
        <span className="mt-1.5 block text-[10px] text-muted-foreground md:hidden">
          {formatDistanceToNow(new Date(alert.detectedAt), { addSuffix: true })}
        </span>
      </div>
    </div>
  );
}
