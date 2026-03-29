"use client";

import { useState } from "react";
import {
  X,
  ChevronDown,
  UserPlus,
  RefreshCcw,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { formatCents } from "@/components/closers/types";
import { cn } from "@/lib/utils";
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
    <div className={cn(
      "border-b border-border/50 last:border-0",
      account.noPriorHistory && "bg-red-50/30 dark:bg-red-950/10",
      !account.noPriorHistory && account.amountChanged && "bg-amber-50/30 dark:bg-amber-950/10"
    )}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors"
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground shrink-0 transition-transform",
            expanded && "rotate-180"
          )}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground truncate">
              {account.brandName}
            </p>
            {hasWarning && (
              <AlertTriangle className={cn(
                "h-3.5 w-3.5 shrink-0",
                account.noPriorHistory
                  ? "text-red-500 dark:text-red-400"
                  : "text-amber-500 dark:text-amber-400"
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
          <p className="text-sm font-semibold text-foreground">
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
        <div className="px-4 pb-4 pt-1 md:pl-11">
          {account.noPriorHistory ? (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-950/20 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 dark:text-red-300">
                Sales Rep is marked as REBILL but no matching account was found in previous months. This may be the first billing cycle or a name mismatch. Please verify.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-border/50 bg-muted/30 overflow-hidden">
              <div className="grid grid-cols-3 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border/50">
                <span>Month</span>
                <span className="text-right">Due</span>
                <span className="text-right">Paid</span>
              </div>
              {account.priorMonths.map((pm) => (
                <div
                  key={`${pm.year}-${pm.month}`}
                  className="grid grid-cols-3 gap-2 px-3 py-2 text-xs text-foreground border-b border-border/30 last:border-0"
                >
                  <span>{monthLabel(pm.month, pm.year)}</span>
                  <span className="text-right">{formatCents(pm.amountDue)}</span>
                  <span className="text-right">{formatCents(pm.amountPaid)}</span>
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
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {account.brandName}
        </p>
        <p className="text-xs text-muted-foreground">
          {account.vertical || "No vertical"}
          {account.salesRep ? ` \u00b7 ${account.salesRep}` : ""}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold text-foreground">
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
      <div className="flex items-center justify-between px-6 py-3 bg-blue-50/50 dark:bg-blue-950/20 border-b border-border/50">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <span className="text-sm font-medium text-foreground">
            {metrics.newAccountCount} new account
            {metrics.newAccountCount !== 1 ? "s" : ""} in{" "}
            {monthLabel(month, year)}
          </span>
        </div>
        <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
          {formatCents(metrics.newAccountRevenue)}
        </span>
      </div>
      <div className="max-h-[60vh] overflow-y-auto">
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
      <div className="flex items-center justify-between px-6 py-3 bg-violet-50/50 dark:bg-violet-950/20 border-b border-border/50">
        <div className="flex items-center gap-2">
          <RefreshCcw className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          <span className="text-sm font-medium text-foreground">
            {metrics.rebillAccountCount} rebilled account
            {metrics.rebillAccountCount !== 1 ? "s" : ""} in{" "}
            {monthLabel(month, year)}
          </span>
        </div>
        <span className="text-sm font-bold text-violet-600 dark:text-violet-400">
          {formatCents(metrics.rebillAccountRevenue)}
        </span>
      </div>
      <div className="max-h-[60vh] overflow-y-auto">
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
  // Next month from the selected month
  let nextMonth = month + 1;
  let nextYear = year;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear++;
  }

  return (
    <>
      <div className="flex items-center justify-between px-6 py-3 bg-cyan-50/50 dark:bg-cyan-950/20 border-b border-border/50">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
          <span className="text-sm font-medium text-foreground">
            Forecast for {monthLabel(nextMonth, nextYear)}
          </span>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {forecast.limitedData && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Limited data &mdash; forecast based on{" "}
              {forecast.trailingMonths} month
              {forecast.trailingMonths !== 1 ? "s" : ""}. Accuracy improves
              with more historical data.
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">
              Projected New
            </p>
            <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
              {forecast.projectedNewAccounts}
            </p>
            <p className="text-xs text-muted-foreground">accounts</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">New Revenue</p>
            <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
              {formatCents(forecast.projectedNewRevenue)}
            </p>
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">
              Rebill Revenue
            </p>
            <p className="text-lg font-bold text-violet-600 dark:text-violet-400">
              {formatCents(forecast.projectedRebillRevenue)}
            </p>
          </div>
        </div>

        {forecast.historicalData.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
              Historical Breakdown
            </p>
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <div className="grid grid-cols-5 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/30 border-b border-border/50">
                <span>Month</span>
                <span className="text-right">New</span>
                <span className="text-right">New Rev</span>
                <span className="text-right">Rebill</span>
                <span className="text-right">Rebill Rev</span>
              </div>
              {forecast.historicalData.map((d) => (
                <div
                  key={`${d.year}-${d.month}`}
                  className="grid grid-cols-5 gap-2 px-3 py-2 text-xs text-foreground border-b border-border/30 last:border-0"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative w-full mx-4 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden",
          view === "rebill" ? "max-w-2xl" : "max-w-lg"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">
            {titles[view]}
          </h3>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

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
      </div>
    </div>
  );
}
