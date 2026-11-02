"use client";

import { Suspense } from "react";
import { useAds } from "@/hooks/useAds";
import { useAdSets } from "@/hooks/useAdSets";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useDateRange } from "@/hooks/useDateRange";
import { useHydrated } from "@/hooks/useHydrated";
import { useAccounts } from "@/hooks/useAccounts";
import { DashboardShell } from "@/components/layout/DashboardShell";
import AdSetLoading from "./loading";
import { DrilldownBreadcrumb } from "@/components/drilldown/DrilldownBreadcrumb";
import { AdTable } from "@/components/drilldown/AdTable";
import { MetaKpiCards } from "@/components/overview/MetaKpiCards";
import { metaStatusLabel, metaStatusTone } from "@/components/overview/metaStatus";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const hydrated = useHydrated();
  const { data: accounts } = useAccounts(dateRange);
  const { data: campaigns } = useCampaigns(accountId, dateRange);
  const { data: adsets, isLoading: adsetsLoading } = useAdSets(campaignId, dateRange);
  const { data: ads, isLoading: adsLoading, error: adsError } = useAds(adsetId, dateRange);

  const account = accounts?.find((a) => a.id === accountId);
  const campaign = campaigns?.find((c) => c.id === campaignId);
  const adset = adsets?.find((s) => s.id === adsetId);

  const accountName = account?.name ?? accountId;
  const campaignName = campaign?.name ?? campaignId;
  const adsetName = adset?.name ?? adsetId;

  // The shell may already hold this page's data at hydration (see useHydrated).
  if (!hydrated) return <AdSetLoading />;

  return (
    <DashboardShell wide>
      <div className="space-y-6">
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
        <div className="min-w-0">
          <h2 className="line-clamp-2 text-2xl lg:text-3xl font-semibold tracking-tight [overflow-wrap:anywhere]">{adsetName}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {adset ? (
              <>
                <span>{adset.optimizationGoal}</span>
                <span aria-hidden>·</span>
                <span>{adset.billingEvent}</span>
                <StatusBadge tone={metaStatusTone(adset.status)}>{metaStatusLabel(adset.status)}</StatusBadge>
              </>
            ) : (
              <span>Ad set</span>
            )}
          </div>
        </div>

        {/* Ad set KPIs (skeleton while the ad set list loads) */}
        <MetaKpiCards
          metrics={adset?.insights}
          isLoading={adsetsLoading}
          currency={account?.currency}
        />

        {/* Ads table */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 space-y-0">
            <CardTitle>Ads</CardTitle>
            {ads && <Badge variant="secondary">{ads.length}</Badge>}
          </CardHeader>
          <CardContent>
            {adsError ? (
              <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
                <AlertTriangle className="size-4 shrink-0" />
                Failed to load ads: {(adsError as Error).message}
              </div>
            ) : (
              <AdTable ads={ads} isLoading={adsLoading} currency={account?.currency} />
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}

export default function AdSetPage({ params }: AdSetPageProps) {
  return (
    <Suspense
      fallback={
        <DashboardShell wide>
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
