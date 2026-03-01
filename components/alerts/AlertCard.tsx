import { AlertTriangle, AlertCircle, Info, TrendingDown, TrendingUp, DollarSign, Percent } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Alert } from "@/types/alerts";

const SEVERITY_STYLES = {
  critical: {
    border: "border-red-500/30 bg-red-500/10 dark:bg-red-500/10 dark:border-red-500/30",
    badge: "bg-red-500/20 text-red-400 dark:bg-red-500/20 dark:text-red-400",
    icon: AlertTriangle,
    iconColor: "text-red-500",
  },
  warning: {
    border: "border-amber-500/30 bg-amber-500/10 dark:bg-amber-500/10 dark:border-amber-500/30",
    badge: "bg-amber-500/20 text-amber-500 dark:bg-amber-500/20 dark:text-amber-400",
    icon: AlertCircle,
    iconColor: "text-amber-500",
  },
  info: {
    border: "border-blue-500/30 bg-blue-500/10 dark:bg-blue-500/10 dark:border-blue-500/30",
    badge: "bg-blue-500/20 text-blue-500 dark:bg-blue-500/20 dark:text-blue-400",
    icon: Info,
    iconColor: "text-blue-500",
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
  const TypeIcon = TYPE_ICONS[alert.type] ?? AlertCircle;

  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition-colors",
        styles.border,
        compact && "p-3"
      )}
    >
      <div className="flex items-start gap-3">
        <SeverityIcon
          className={cn("mt-0.5 h-4 w-4 shrink-0", styles.iconColor)}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="font-medium text-sm">{alert.title}</p>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                styles.badge
              )}
            >
              {alert.severity.toUpperCase()}
            </span>
          </div>

          {!compact && (
            <p className="mt-1 text-sm text-muted-foreground">{alert.description}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <TypeIcon className="h-3 w-3" />
              {alert.entityName}
            </span>
            {alert.accountName !== alert.entityName && (
              <span>{alert.accountName}</span>
            )}
            <span className="capitalize">{alert.entityType}</span>
            <span className="ml-auto">
              {new Date(alert.detectedAt).toLocaleTimeString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
