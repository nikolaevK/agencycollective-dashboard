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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { SetupBanner } from "@/components/layout/SetupBanner";

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
        roas: avg(accounts.map((a) => a.delta.roas)),
        conversions: avg(accounts.map((a) => a.delta.conversions)),
        conversionValue: avg(accounts.map((a) => a.delta.conversionValue)),
        costPerPurchase: avg(accounts.map((a) => a.delta.costPerPurchase)),
      }
    : undefined;

  const dateRangeStr = currentPreset
    ? `preset=${currentPreset}`
    : dateRange.since && dateRange.until
    ? `since=${dateRange.since}&until=${dateRange.until}`
    : undefined;

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Setup banner for unconfigured / expired token */}
        <SetupBanner show={isAuthError} />

        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold">Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {accounts ? `${accounts.length} account${accounts.length !== 1 ? "s" : ""}` : "Loading accounts..."}
          </p>
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
            Fetching insights for your accounts via Meta Batch API...
          </p>
        )}

        {/* Main grid: charts + alerts */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Spend distribution donut */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Spend by Account</CardTitle>
            </CardHeader>
            <CardContent>
              <SpendDonutChart accounts={accounts} isLoading={accountsLoading} />
            </CardContent>
          </Card>

          {/* Active alerts preview */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">
                Active Alerts
                {alerts && alerts.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({alerts.length})
                  </span>
                )}
              </CardTitle>
              <Link
                href="/dashboard/alerts"
                className="text-sm text-primary hover:underline"
              >
                View all
              </Link>
            </CardHeader>
            <CardContent>
              <AlertFeed
                alerts={alerts}
                isLoading={alertsLoading}
                groupBySeverity={false}
                compact
                maxItems={5}
              />
            </CardContent>
          </Card>
        </div>

        {/* Accounts table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            <AccountsTable
              accounts={accounts}
              isLoading={accountsLoading}
              dateRange={dateRangeStr}
            />
          </CardContent>
        </Card>
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
