import { AlertTriangle, AlertCircle, Info, TrendingDown, TrendingUp, DollarSign, Percent } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Alert } from "@/types/alerts";

const SEVERITY_STYLES = {
  critical: {
    border: "border-red-200 bg-red-50",
    badge: "bg-red-100 text-red-700",
    icon: AlertTriangle,
    iconColor: "text-red-500",
  },
  warning: {
    border: "border-yellow-200 bg-yellow-50",
    badge: "bg-yellow-100 text-yellow-700",
    icon: AlertCircle,
    iconColor: "text-yellow-500",
  },
  info: {
    border: "border-blue-200 bg-blue-50",
    badge: "bg-blue-100 text-blue-700",
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
