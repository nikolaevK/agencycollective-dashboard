"use client";

import { Suspense } from "react";
import { useAds } from "@/hooks/useAds";
import { useAdSets } from "@/hooks/useAdSets";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useDateRange } from "@/hooks/useDateRange";
import { useAccounts } from "@/hooks/useAccounts";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { DrilldownBreadcrumb } from "@/components/drilldown/DrilldownBreadcrumb";
import { AdTable } from "@/components/drilldown/AdTable";
import { KpiGrid } from "@/components/overview/KpiGrid";
import { AlertTriangle } from "lucide-react";

interface AdSetPageProps {
  params: { accountId: string; campaignId: string; adsetId: string };
}

function AdSetContent({
  accountId,
  campaignId,
  adsetId,
}: {
  accountId: string;
  campaignId: string;
  adsetId: string;
}) {
  const { dateRange } = useDateRange();
  const { data: accounts } = useAccounts(dateRange);
  const { data: campaigns } = useCampaigns(accountId, dateRange);
  const { data: adsets } = useAdSets(campaignId, dateRange);
  const { data: ads, isLoading: adsLoading, error: adsError } = useAds(adsetId, dateRange);

  const account = accounts?.find((a) => a.id === accountId);
  const campaign = campaigns?.find((c) => c.id === campaignId);
  const adset = adsets?.find((s) => s.id === adsetId);

  const accountName = account?.name ?? accountId;
  const campaignName = campaign?.name ?? campaignId;
  const adsetName = adset?.name ?? adsetId;

  return (
    <DashboardShell>
      <div className="space-y-8">
        <DrilldownBreadcrumb
          items={[
            { label: accountName, href: `/dashboard/accounts/${accountId}` },
            {
              label: campaignName,
              href: `/dashboard/accounts/${accountId}/campaigns/${campaignId}`,
            },
            { label: adsetName },
          ]}
        />

        {/* Header */}
        <div>
          {/* Mobile */}
          <div className="lg:hidden">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Ad Set</p>
            <h1 className="text-xl font-bold text-foreground truncate">{adsetName}</h1>
            {adset && (
              <p className="text-[11px] text-muted-foreground mt-1">
                {adset.optimizationGoal} · {adset.status}
              </p>
            )}
          </div>
          {/* Desktop */}
          <div className="hidden lg:block">
            <h2 className="text-3xl font-light text-foreground">
              Ad Set <span className="font-bold text-primary line-clamp-1">{adsetName}</span>
            </h2>
            {adset && (
              <p className="text-sm text-muted-foreground mt-1">
                {adset.optimizationGoal} · {adset.billingEvent} · {adset.status}
              </p>
            )}
          </div>
        </div>

        {/* Ad set KPIs */}
        {adset && (
          <KpiGrid
            metrics={adset.insights}
            isLoading={false}
            currency={account?.currency}
          />
        )}

        {/* Ads table */}
        <div className="bg-card rounded-2xl shadow-sm border border-border/50 dark:border-white/[0.06] overflow-hidden px-4 py-5 lg:px-8 lg:py-6">
          <div className="flex items-center justify-between mb-6">
            <h4 className="text-sm font-semibold uppercase tracking-wider lg:text-xl lg:font-bold lg:normal-case lg:tracking-normal text-foreground">
              Ads
            </h4>
            {ads && (
              <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-[10px] font-bold">
                {ads.length}
              </span>
            )}
          </div>
          {adsError ? (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4" />
              Failed to load ads: {(adsError as Error).message}
            </div>
          ) : (
            <AdTable ads={ads} isLoading={adsLoading} />
          )}
        </div>
      </div>
    </DashboardShell>
  );
}

export default function AdSetPage({ params }: AdSetPageProps) {
  return (
    <Suspense
      fallback={
        <DashboardShell>
          <div className="animate-pulse text-muted-foreground">Loading ad set...</div>
        </DashboardShell>
      }
    >
      <AdSetContent
        accountId={params.accountId}
        campaignId={params.campaignId}
        adsetId={params.adsetId}
      />
    </Suspense>
  );
}
