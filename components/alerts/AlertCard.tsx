import Link from "next/link";
import {
  AlertCircle,
  ArrowUpRight,
  DollarSign,
  Percent,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Alert } from "@/types/alerts";

const SEVERITY: Record<Alert["severity"], { tone: BadgeTone; label: string; iconClass: string }> = {
  critical: { tone: "danger", label: "Critical", iconClass: "text-red-600 dark:text-red-400" },
  warning: { tone: "warning", label: "Warning", iconClass: "text-amber-600 dark:text-amber-400" },
  info: { tone: "info", label: "Info", iconClass: "text-sky-600 dark:text-sky-400" },
};

const TYPE_ICONS = {
  budget_pacing: DollarSign,
  ctr_drop: TrendingDown,
  cpc_spike: TrendingUp,
  roas_below_threshold: Percent,
  spend_anomaly: AlertCircle,
};

/** The page the alert is about: its campaign, else its account (an ad set
 *  alert doesn't carry its campaign id, so it opens the account). */
function alertTarget(alert: Alert, dateQuery?: string): { href: string; label: string } {
  const base =
    alert.entityType === "campaign"
      ? `/dashboard/accounts/${alert.accountId}/campaigns/${alert.entityId}`
      : `/dashboard/accounts/${alert.accountId}`;
  return {
    href: dateQuery ? `${base}?${dateQuery}` : base,
    label: alert.entityType === "campaign" ? "Open campaign" : "Open account",
  };
}

interface AlertCardProps {
  alert: Alert;
  compact?: boolean;
  /** Carried into the link ("preset=last_7d"). */
  dateQuery?: string;
}

export function AlertCard({ alert, compact = false, dateQuery }: AlertCardProps) {
  const severity = SEVERITY[alert.severity];
  const Icon = TYPE_ICONS[alert.type] ?? AlertCircle;
  const target = alertTarget(alert, dateQuery);
  const where =
    alert.entityType === "account" ? alert.accountName : `${alert.accountName} · ${alert.entityName}`;

  return (
    <div className={cn("flex gap-3 rounded-2xl border p-4", compact && "p-3")}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", severity.iconClass)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-medium">{alert.title}</h4>
          <StatusBadge tone={severity.tone} className="shrink-0">
            {severity.label}
          </StatusBadge>
        </div>
        <p className={cn("mt-1 text-xs leading-relaxed text-muted-foreground", compact && "line-clamp-2")}>
          {alert.description}
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="min-w-0 truncate text-xs text-muted-foreground" title={where}>
            {where} · {formatDistanceToNow(new Date(alert.detectedAt), { addSuffix: true })}
          </p>
          <Link
            href={target.href}
            prefetch={false}
            className="-my-2 inline-flex shrink-0 items-center gap-0.5 rounded-full py-2 text-xs font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/30"
          >
            {target.label}
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
