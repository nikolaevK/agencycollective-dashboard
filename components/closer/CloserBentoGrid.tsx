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
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
            value: String(lifetime.closedCount),
            sub: `${formatCents(lifetime.closedRevenue)} closed revenue`,
          },
          {
            key: "lifetime-paid",
            label: "Total paid revenue",
            icon: Wallet,
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
            custom: (
              <>
                {readOnly ? (
                  <p className="text-xl sm:text-2xl font-semibold tracking-tight tabular-nums">
                    {formatCents(quotaCents)}
                  </p>
                ) : (
                  <InlineQuotaEditor currentQuota={quotaCents} />
                )}
                {quotaPct != null && monthClosed != null ? (
                  <>
                    <Progress
                      value={Math.max(quotaPct, 2)}
                      aria-valuenow={quotaPct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuetext={`${quotaPct}%`}
                      className={cn(
                        "mt-2 h-1.5",
                        quotaPct >= 100 ? "[&>div]:bg-emerald-500" : "[&>div]:bg-chart-1"
                      )}
                    />
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
              value: formatCents(window.pendingPipeline),
              sub: `${window.pendingCount} awaiting signature`,
            },
            {
              key: "win-avg",
              label: "Avg deal value",
              icon: CheckCircle2,
              value: formatCents(window.avgClosedValue),
              sub: "Per closed deal",
            },
            {
              key: "win-show",
              label: "Show rate",
              icon: UserCheck,
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
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.key}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 md:pb-2">
                <CardDescription>{card.label}</CardDescription>
                <Icon className="size-4 shrink-0 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {card.custom ?? (
                  <>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-xl sm:text-2xl font-semibold tracking-tight tabular-nums">
                        {card.value}
                      </p>
                      {card.delta}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
