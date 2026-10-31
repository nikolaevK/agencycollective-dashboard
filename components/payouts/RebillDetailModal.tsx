"use client";

import { useState } from "react";
import {
  ChevronDown,
  UserPlus,
  RefreshCcw,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { formatCents } from "@/components/closers/types";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { RebillMetrics, ForecastData, RebillAccount } from "@/lib/payouts";
import type { MetricCardType } from "./PayoutSummaryCards";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function monthLabel(month: number, year: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

interface RebillDetailModalProps {
  open: boolean;
  onClose: () => void;
  view: MetricCardType;
  metrics: RebillMetrics | undefined;
  forecast: ForecastData | undefined;
  month: number;
  year: number;
}

/* ── Expandable rebill row ─────────────────────────────────────── */
function RebillRow({ account }: { account: RebillAccount }) {
  const [expanded, setExpanded] = useState(false);
  const hasWarning = account.noPriorHistory || account.amountChanged;

  return (
    <div className="border-b last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-6 py-3 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
      >
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground shrink-0 transition-transform",
            expanded && "rotate-180"
          )}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">
              {account.brandName}
            </p>
            {hasWarning && (
              <AlertTriangle className={cn(
                "size-3.5 shrink-0",
                account.noPriorHistory ? "text-red-500" : "text-amber-500"
              )} />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {account.noPriorHistory
              ? "No prior history found \u2014 verify rebill"
              : `${account.priorMonths.length} prior month${account.priorMonths.length !== 1 ? "s" : ""}`}
            {account.salesRep ? ` \u00b7 ${account.salesRep}` : ""}
          </p>
          {account.amountChanged && !account.noPriorHistory && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              Amount changed from {formatCents(account.lastAmountPaid ?? 0)} &rarr; {formatCents(account.totalAmountPaid ?? 0)} &mdash; verify
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold tabular-nums">
            {formatCents(account.totalAmountDue)}
          </p>
          {account.totalAmountPaid > 0 && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              {formatCents(account.totalAmountPaid)} paid
            </p>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-6 pb-4 pt-1 md:pl-[3.25rem]">
          {account.noPriorHistory ? (
            <div className="flex items-start gap-2 rounded-2xl bg-destructive/10 px-3 py-2 text-destructive">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <p className="text-xs">
                Sales Rep is marked as REBILL but no matching account was found in previous months. This may be the first billing cycle or a name mismatch. Please verify.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl bg-muted/50 overflow-hidden">
              <div className="grid grid-cols-3 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground border-b">
                <span>Month</span>
                <span className="text-right">Due</span>
                <span className="text-right">Paid</span>
              </div>
              {account.priorMonths.map((pm) => (
                <div
                  key={`${pm.year}-${pm.month}`}
                  className="grid grid-cols-3 gap-2 px-3 py-2 text-xs border-b last:border-0"
                >
                  <span>{monthLabel(pm.month, pm.year)}</span>
                  <span className="text-right tabular-nums">{formatCents(pm.amountDue)}</span>
                  <span className="text-right tabular-nums">{formatCents(pm.amountPaid)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── New account row ───────────────────────────────────────────── */
function NewAccountRow({ account }: { account: RebillAccount }) {
  return (
    <div className="flex items-center gap-3 px-6 py-3 border-b last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {account.brandName}
        </p>
        <p className="text-xs text-muted-foreground">
          {account.vertical || "No vertical"}
          {account.salesRep ? ` \u00b7 ${account.salesRep}` : ""}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold tabular-nums">
          {formatCents(account.totalAmountDue)}
        </p>
        {account.totalAmountPaid > 0 && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            {formatCents(account.totalAmountPaid)} paid
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Modal views ───────────────────────────────────────────────── */
function NewAccountsView({ metrics, month, year }: { metrics: RebillMetrics; month: number; year: number }) {
  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-3 px-6 py-3 bg-muted/50 border-y">
        <div className="flex min-w-0 items-center gap-2">
          <UserPlus className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium">
            {metrics.newAccountCount} new account
            {metrics.newAccountCount !== 1 ? "s" : ""} in{" "}
            {monthLabel(month, year)}
          </span>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {formatCents(metrics.newAccountRevenue)}
        </span>
      </div>
      <div className="min-h-0 max-h-[60dvh] overflow-y-auto overscroll-contain">
        {metrics.newAccounts.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted-foreground text-center">
            No new accounts this month
          </p>
        ) : (
          metrics.newAccounts.map((a) => (
            <NewAccountRow key={a.normalizedName} account={a} />
          ))
        )}
      </div>
    </>
  );
}

function RebillAccountsView({ metrics, month, year }: { metrics: RebillMetrics; month: number; year: number }) {
  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-3 px-6 py-3 bg-muted/50 border-y">
        <div className="flex min-w-0 items-center gap-2">
          <RefreshCcw className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium">
            {metrics.rebillAccountCount} rebilled account
            {metrics.rebillAccountCount !== 1 ? "s" : ""} in{" "}
            {monthLabel(month, year)}
          </span>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {formatCents(metrics.rebillAccountRevenue)}
        </span>
      </div>
      <div className="min-h-0 max-h-[60dvh] overflow-y-auto overscroll-contain">
        {metrics.rebilledAccounts.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted-foreground text-center">
            No rebilled accounts this month
          </p>
        ) : (
          metrics.rebilledAccounts.map((a) => (
            <RebillRow key={a.normalizedName} account={a} />
          ))
        )}
      </div>
    </>
  );
}

function ForecastView({
  forecast,
  month,
  year,
}: {
  forecast: ForecastData;
  month: number;
  year: number;
}) {
  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-3 px-6 py-3 bg-muted/50 border-y">
        <div className="flex min-w-0 items-center gap-2">
          <TrendingUp className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium">
            Forecast for {monthLabel(month, year)}
          </span>
        </div>
      </div>

      <div className="min-h-0 p-6 space-y-5 max-h-[60dvh] overflow-y-auto overscroll-contain">
        {forecast.limitedData && (
          <div className="flex items-start gap-2 rounded-2xl bg-muted/50 px-4 py-3">
            <AlertTriangle className="size-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Limited data &mdash; forecast based on{" "}
              {forecast.trailingMonths} month
              {forecast.trailingMonths !== 1 ? "s" : ""}. Accuracy improves
              with more historical data.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl bg-muted/50 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">
              Projected New
            </p>
            <p className="text-lg font-semibold tracking-tight tabular-nums">
              {forecast.projectedNewAccounts}
            </p>
            <p className="text-xs text-muted-foreground">accounts</p>
          </div>
          <div className="rounded-2xl bg-muted/50 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">New Revenue</p>
            <p className="text-lg font-semibold tracking-tight tabular-nums">
              {formatCents(forecast.projectedNewRevenue)}
            </p>
          </div>
          <div className="rounded-2xl bg-muted/50 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">
              Rebill Revenue
            </p>
            <p className="text-lg font-semibold tracking-tight tabular-nums">
              {formatCents(forecast.projectedRebillRevenue)}
            </p>
          </div>
        </div>

        {forecast.historicalData.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">
              Historical Breakdown
            </p>
            <div className="rounded-2xl border overflow-x-auto">
              <div className="min-w-[440px]">
                <div className="grid grid-cols-5 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/50 border-b">
                  <span>Month</span>
                  <span className="text-right">New</span>
                  <span className="text-right">New Rev</span>
                  <span className="text-right">Rebill</span>
                  <span className="text-right">Rebill Rev</span>
                </div>
                {forecast.historicalData.map((d) => (
                  <div
                    key={`${d.year}-${d.month}`}
                    className="grid grid-cols-5 gap-2 px-3 py-2 text-xs tabular-nums border-b last:border-0"
                  >
                    <span>{monthLabel(d.month, d.year)}</span>
                    <span className="text-right">{d.newCount}</span>
                    <span className="text-right">
                      {formatCents(d.newRevenue)}
                    </span>
                    <span className="text-right">{d.rebillCount}</span>
                    <span className="text-right">
                      {formatCents(d.rebillRevenue)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center">
          Based on {forecast.trailingMonths}-month trailing weighted average
        </p>
      </div>
    </>
  );
}

/* ── Main modal ────────────────────────────────────────────────── */
export function RebillDetailModal({
  open,
  onClose,
  view,
  metrics,
  forecast,
  month,
  year,
}: RebillDetailModalProps) {
  if (!open) return null;

  const titles: Record<MetricCardType, string> = {
    new: "New Accounts",
    rebill: "Rebilled Accounts",
    forecast: "Revenue Forecast",
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        // The old modal had no Escape handler — it closes only via the X
        // button or a backdrop click.
        onEscapeKeyDown={(e) => e.preventDefault()}
        aria-describedby={undefined}
        className={cn(
          "flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0",
          view === "rebill" ? "sm:max-w-2xl" : "sm:max-w-lg"
        )}
      >
        {/* Header */}
        <DialogHeader className="shrink-0 px-6 py-5 pr-14">
          <DialogTitle>{titles[view]}</DialogTitle>
        </DialogHeader>

        {/* Content */}
        {view === "new" && metrics && (
          <NewAccountsView metrics={metrics} month={month} year={year} />
        )}
        {view === "rebill" && metrics && (
          <RebillAccountsView metrics={metrics} month={month} year={year} />
        )}
        {view === "forecast" && forecast && (
          <ForecastView forecast={forecast} month={month} year={year} />
        )}
        {((view === "new" || view === "rebill") && !metrics) ||
        (view === "forecast" && !forecast) ? (
          <p className="px-6 py-8 text-sm text-muted-foreground text-center">
            Loading...
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
