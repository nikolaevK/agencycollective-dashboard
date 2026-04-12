"use client";

import { Suspense } from "react";
import { useAccounts } from "@/hooks/useAccounts";
import { useAlerts } from "@/hooks/useAlerts";
import { useDateRange } from "@/hooks/useDateRange";
import { aggregateInsights } from "@/lib/meta/transformers";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { KpiGrid } from "@/components/overview/KpiGrid";
import { AccountsTable } from "@/components/overview/AccountsTable";
import { SpendDonutChart } from "@/components/overview/SpendDonutChart";
import { AlertFeed } from "@/components/alerts/AlertFeed";
import Link from "next/link";
import { SetupBanner } from "@/components/layout/SetupBanner";
import { Download, MoreVertical } from "lucide-react";

function OverviewContent() {
  const { dateRange, currentPreset } = useDateRange();
  const { data: accounts, isLoading: accountsLoading, error: accountsError } = useAccounts(dateRange);
  const { data: alerts, isLoading: alertsLoading } = useAlerts(dateRange);

  const err = accountsError as (Error & { status?: number }) | null;
  const isAuthError = err?.status === 401;

  // Aggregate KPIs across all accounts
  const aggregated = accounts ? aggregateInsights(accounts.map((a) => a.insights)) : undefined;

  // Aggregate deltas (weighted avg)
  const aggregatedDelta = accounts && accounts.length > 0
    ? {
        spend: avg(accounts.map((a) => a.delta.spend)),
        impressions: avg(accounts.map((a) => a.delta.impressions)),
        reach: avg(accounts.map((a) => a.delta.reach)),
        ctr: avg(accounts.map((a) => a.delta.ctr)),
        cpc: avg(accounts.map((a) => a.delta.cpc)),
        cpm: avg(accounts.map((a) => a.delta.cpm)),
        roas: avg(accounts.map((a) => a.delta.roas)),
        conversions: avg(accounts.map((a) => a.delta.conversions)),
        conversionValue: avg(accounts.map((a) => a.delta.conversionValue)),
        costPerPurchase: avg(accounts.map((a) => a.delta.costPerPurchase)),
        frequency: avg(accounts.map((a) => a.delta.frequency)),
      }
    : undefined;

  const dateRangeStr = currentPreset
    ? `preset=${currentPreset}`
    : dateRange.since && dateRange.until
    ? `since=${dateRange.since}&until=${dateRange.until}`
    : undefined;

  const alertCount = alerts?.length ?? 0;

  return (
    <DashboardShell>
      <div className="space-y-8">
        {/* Setup banner for unconfigured / expired token */}
        <SetupBanner show={isAuthError} />

        {/* Welcome Header — Mobile */}
        <div className="md:hidden">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
            Performance Hub
          </p>
          <h2 className="text-2xl font-bold text-foreground">Main Overview</h2>
        </div>

        {/* Welcome Header — Desktop */}
        <div className="hidden md:flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h2 className="text-3xl font-light text-foreground">
              Overview <span className="font-bold text-primary">Dashboard</span>
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              {accounts
                ? `Real-time performance metrics across ${accounts.length} account${accounts.length !== 1 ? "s" : ""}.`
                : "Loading your accounts\u2026"}
            </p>
          </div>
        </div>

        {/* KPI Grid */}
        <KpiGrid
          metrics={aggregated}
          delta={aggregatedDelta}
          isLoading={accountsLoading}
        />

        {/* Loading hint */}
        {accountsLoading && (
          <p className="text-xs text-muted-foreground">
            Fetching insights for your accounts via Meta Batch API\u2026
          </p>
        )}

        {/* Middle Section: Asymmetric Layout — 2/3 spend chart, 1/3 alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left column: Spend chart */}
          <div className="lg:col-span-2 space-y-8">
            {/* Spend by Account */}
            <div className="bg-card rounded-2xl p-5 lg:p-8 shadow-sm border border-border/50 dark:border-white/[0.06]">
              <div className="flex justify-between items-center mb-6 lg:mb-10">
                <div>
                  <h4 className="text-sm font-semibold uppercase tracking-wider lg:text-xl lg:font-bold lg:normal-case lg:tracking-normal text-foreground">
                    Spend by Account
                  </h4>
                  <p className="text-xs text-muted-foreground hidden lg:block">
                    Proportional allocation across top accounts
                  </p>
                </div>
                <div className="hidden lg:flex gap-2">
                  <button className="p-2 hover:bg-muted/40 rounded-lg transition-colors" aria-label="Download report">
                    <Download className="h-5 w-5 text-muted-foreground" />
                  </button>
                  <button className="p-2 hover:bg-muted/40 rounded-lg transition-colors" aria-label="More options">
                    <MoreVertical className="h-5 w-5 text-muted-foreground" />
                  </button>
                </div>
              </div>
              <SpendDonutChart accounts={accounts} isLoading={accountsLoading} />
            </div>
          </div>

          {/* Right column: Active Alerts */}
          <div className="space-y-8">
            <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50 dark:border-white/[0.06] flex flex-col h-full">
              <div className="flex items-center justify-between mb-6">
                <h4 className="text-sm font-semibold uppercase tracking-wider lg:text-lg lg:font-bold lg:normal-case lg:tracking-normal text-foreground">Active Alerts</h4>
                {alertCount > 0 && (
                  <span className="px-2 py-0.5 bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 rounded-full lg:rounded text-[10px] font-bold">
                    {alertCount} NEW
                  </span>
                )}
              </div>

              <div className="flex-1">
                <AlertFeed
                  alerts={alerts}
                  isLoading={alertsLoading}
                  groupBySeverity={false}
                  compact
                  maxItems={4}
                />
              </div>

              <Link
                href="/dashboard/alerts"
                className="mt-6 pt-4 block text-sm font-bold text-muted-foreground text-center hover:text-primary transition-colors"
              >
                View All Notifications
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom Section: All Accounts */}
        <div className="bg-card rounded-2xl shadow-sm border border-border/50 dark:border-white/[0.06] overflow-hidden px-4 py-5 md:px-8 md:py-6">
          <AccountsTable
            accounts={accounts}
            isLoading={accountsLoading}
            dateRange={dateRangeStr}
          />
        </div>
      </div>
    </DashboardShell>
  );
}

function avg(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length === 0) return null;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardShell><div className="animate-pulse text-muted-foreground">Loading...</div></DashboardShell>}>
      <OverviewContent />
    </Suspense>
  );
}
