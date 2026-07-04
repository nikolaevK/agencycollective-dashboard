"use client";

import {
  Award,
  CheckCircle2,
  Clock,
  Crosshair,
  DollarSign,
  FileCheck,
  TrendingUp,
  UserCheck,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCents } from "@/components/closers/types";
import { TrendDelta } from "@/components/shared/TrendDelta";
import { InlineQuotaEditor } from "./InlineQuotaEditor";
import type { DealMetricBucket } from "@/lib/deals";

interface Props {
  lifetime: DealMetricBucket;
  window: DealMetricBucket;
  /** Same-length period before the window — powers the Δ chips. */
  previous?: DealMetricBucket | null;
  /** Current-calendar-month bucket — powers the quota progress bar
   *  independent of the selected time frame. */
  monthToDate?: DealMetricBucket;
  /** Human label for the active window — "This month", "All time", custom range, etc. */
  windowLabel: string;
  /** True when the window IS lifetime (e.g. "All time" selected). Hides the
   *  per-window section to avoid showing the same numbers twice. */
  isLifetimeWindow: boolean;
  /** Closer's monthly target in cents (editable inline). */
  quota?: number;
  /** Admin "view as" mode — the quota editor mutates the CLOSER's session
   *  endpoint, so it must render read-only for admins. */
  readOnly?: boolean;
}

/**
 * Two-section dashboard:
 *   - Lifetime: total closed deals, total paid revenue, lifetime show rate, monthly quota.
 *   - Window: closed revenue, paid revenue, outstanding, deals closed,
 *     pending pipeline, avg deal value, show rate (in window).
 *
 * Window section hides itself when `isLifetimeWindow` is true so the closer
 * doesn't see the same numbers stacked twice.
 */
export function CloserBentoGrid({
  lifetime,
  window,
  previous,
  monthToDate,
  windowLabel,
  isLifetimeWindow,
  quota,
  readOnly,
}: Props) {
  const quotaCents = quota ?? 0;
  const monthClosed = monthToDate?.closedRevenue ?? null;
  const quotaPct =
    quotaCents > 0 && monthClosed != null
      ? Math.min(100, Math.round((monthClosed / quotaCents) * 100))
      : null;

  return (
    <div className="space-y-6 mb-6">
      <Section
        title="Lifetime"
        subtitle="Your full sales history"
        cards={[
          {
            key: "lifetime-closed",
            label: "Total closed deals",
            icon: Award,
            iconBg: "bg-violet-100 dark:bg-violet-500/15",
            iconColor: "text-violet-600 dark:text-violet-400",
            value: String(lifetime.closedCount),
            sub: `${formatCents(lifetime.closedRevenue)} closed revenue`,
          },
          {
            key: "lifetime-paid",
            label: "Total paid revenue",
            icon: Wallet,
            iconBg: "bg-emerald-100 dark:bg-emerald-500/15",
            iconColor: "text-emerald-600 dark:text-emerald-400",
            value: formatCents(lifetime.paidRevenue),
            sub:
              lifetime.outstandingRevenue > 0
                ? `${formatCents(lifetime.outstandingRevenue)} still outstanding`
                : "Fully collected",
          },
          {
            key: "lifetime-show",
            label: "Show rate",
            icon: UserCheck,
            iconBg: "bg-cyan-100 dark:bg-cyan-500/15",
            iconColor: "text-cyan-600 dark:text-cyan-400",
            value: `${lifetime.showRate}%`,
            sub:
              lifetime.showCount + lifetime.noShowCount > 0
                ? `${lifetime.showCount} showed · ${lifetime.noShowCount} no-show`
                : "No data yet",
          },
          {
            key: "quota",
            label: "Monthly target",
            icon: Crosshair,
            iconBg: "bg-pink-100 dark:bg-pink-500/15",
            iconColor: "text-pink-600 dark:text-pink-400",
            custom: (
              <>
                {readOnly ? (
                  <p className="text-xl sm:text-2xl font-bold text-foreground">
                    {formatCents(quotaCents)}
                  </p>
                ) : (
                  <InlineQuotaEditor currentQuota={quotaCents} />
                )}
                {quotaPct != null && monthClosed != null ? (
                  <>
                    <div
                      className="mt-2 h-1.5 w-full rounded-full bg-muted/60 dark:bg-white/5"
                      role="progressbar"
                      aria-valuenow={quotaPct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className={cn(
                          "h-1.5 rounded-full transition-all",
                          quotaPct >= 100 ? "bg-emerald-500" : "bg-pink-500/70"
                        )}
                        style={{ width: `${Math.max(quotaPct, 2)}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatCents(monthClosed)} closed this month · {quotaPct}%
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">
                    {readOnly ? "Monthly goal" : "Editable goal"}
                  </p>
                )}
              </>
            ),
          },
        ]}
      />

      {!isLifetimeWindow && (
        <Section
          title={windowLabel}
          subtitle="Selected time frame"
          cards={[
            {
              key: "win-closed-revenue",
              label: "Closed revenue",
              icon: TrendingUp,
              iconBg: "bg-violet-100 dark:bg-violet-500/15",
              iconColor: "text-violet-600 dark:text-violet-400",
              value: formatCents(window.closedRevenue),
              sub: `${window.closedCount} deal${window.closedCount === 1 ? "" : "s"} closed`,
              delta: (
                <TrendDelta
                  current={window.closedRevenue}
                  previous={previous?.closedRevenue}
                />
              ),
            },
            {
              key: "win-paid",
              label: "Paid revenue",
              icon: DollarSign,
              iconBg: "bg-emerald-100 dark:bg-emerald-500/15",
              iconColor: "text-emerald-600 dark:text-emerald-400",
              value: formatCents(window.paidRevenue),
              sub: "Cash collected",
              delta: (
                <TrendDelta current={window.paidRevenue} previous={previous?.paidRevenue} />
              ),
            },
            {
              key: "win-outstanding",
              label: "Outstanding",
              icon: Clock,
              iconBg: "bg-amber-100 dark:bg-amber-500/15",
              iconColor: "text-amber-600 dark:text-amber-400",
              value: formatCents(window.outstandingRevenue),
              sub: "Closed but unpaid",
              delta: (
                <TrendDelta
                  current={window.outstandingRevenue}
                  previous={previous?.outstandingRevenue}
                  lowerIsBetter
                />
              ),
            },
            {
              key: "win-pending",
              label: "Pending pipeline",
              icon: FileCheck,
              iconBg: "bg-blue-100 dark:bg-blue-500/15",
              iconColor: "text-blue-600 dark:text-blue-400",
              value: formatCents(window.pendingPipeline),
              sub: `${window.pendingCount} awaiting signature`,
            },
            {
              key: "win-avg",
              label: "Avg deal value",
              icon: CheckCircle2,
              iconBg: "bg-pink-100 dark:bg-pink-500/15",
              iconColor: "text-pink-600 dark:text-pink-400",
              value: formatCents(window.avgClosedValue),
              sub: "Per closed deal",
            },
            {
              key: "win-show",
              label: "Show rate",
              icon: UserCheck,
              iconBg: "bg-cyan-100 dark:bg-cyan-500/15",
              iconColor: "text-cyan-600 dark:text-cyan-400",
              value: `${window.showRate}%`,
              sub:
                window.showCount + window.noShowCount > 0
                  ? `${window.showCount} showed · ${window.noShowCount} no-show`
                  : "No data this window",
              delta: previous ? (
                <TrendDelta current={window.showRate} previous={previous.showRate} mode="pp" />
              ) : undefined,
            },
          ]}
        />
      )}
    </div>
  );
}

interface CardDef {
  key: string;
  label: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  value?: string;
  sub?: string;
  delta?: React.ReactNode;
  custom?: React.ReactNode;
}

function Section({
  title,
  subtitle,
  cards,
}: {
  title: string;
  subtitle: string;
  cards: CardDef[];
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="text-[11px] text-muted-foreground">{subtitle}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.key}
              className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-4 sm:p-5"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", card.iconBg)}>
                  <Icon className={cn("h-4 w-4", card.iconColor)} />
                </div>
                <span className="text-xs font-medium text-muted-foreground">{card.label}</span>
              </div>
              {card.custom ?? (
                <>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-xl sm:text-2xl font-bold text-foreground">{card.value}</p>
                    {card.delta}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
