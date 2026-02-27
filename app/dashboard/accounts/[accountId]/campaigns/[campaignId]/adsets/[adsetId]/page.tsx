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

        <div>
          <h1 className="text-2xl font-bold line-clamp-1">{adsetName}</h1>
          {adset && (
            <p className="text-sm text-muted-foreground">
              {adset.optimizationGoal} · {adset.billingEvent} · {adset.status}
            </p>
          )}
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
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Ads
              {ads && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({ads.length})
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {adsError ? (
              <div className="flex items-center gap-2 text-destructive text-sm">
                <AlertTriangle className="h-4 w-4" />
                Failed to load ads: {(adsError as Error).message}
              </div>
            ) : (
              <AdTable ads={ads} isLoading={adsLoading} />
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
