"use client";

import { Suspense } from "react";
import { useAdSets } from "@/hooks/useAdSets";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useDateRange } from "@/hooks/useDateRange";
import { useHydrated } from "@/hooks/useHydrated";
import { useAccounts } from "@/hooks/useAccounts";
import { DashboardShell } from "@/components/layout/DashboardShell";
import CampaignLoading from "./loading";
import { DrilldownBreadcrumb } from "@/components/drilldown/DrilldownBreadcrumb";
import { AdSetTable } from "@/components/drilldown/AdSetTable";
import { MetaKpiCards } from "@/components/overview/MetaKpiCards";
import { metaStatusLabel, metaStatusTone } from "@/components/overview/metaStatus";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

interface CampaignPageProps {
  params: { accountId: string; campaignId: string };
}

function CampaignContent({ accountId, campaignId }: { accountId: string; campaignId: string }) {
  const { dateRange } = useDateRange();
  const hydrated = useHydrated();
  const { data: accounts } = useAccounts(dateRange);
  const { data: campaigns, isLoading: campaignsLoading } = useCampaigns(accountId, dateRange);
  const { data: adsets, isLoading: adsetsLoading, error: adsetsError } = useAdSets(campaignId, dateRange);

  const account = accounts?.find((a) => a.id === accountId);
  const campaign = campaigns?.find((c) => c.id === campaignId);
  const accountName = account?.name ?? accountId;
  const campaignName = campaign?.name ?? campaignId;

  // The shell may already hold this page's data at hydration (see useHydrated).
  if (!hydrated) return <CampaignLoading />;

  return (
    <DashboardShell wide>
      <div className="space-y-6">
        <DrilldownBreadcrumb
          items={[
            { label: accountName, href: `/dashboard/accounts/${accountId}` },
            { label: campaignName },
          ]}
        />

        {/* Header */}
        <div className="min-w-0">
          <h2 className="line-clamp-2 text-2xl lg:text-3xl font-semibold tracking-tight [overflow-wrap:anywhere]">{campaignName}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {campaign ? (
              <>
                <span>{campaign.objective}</span>
                {campaign.budget > 0 && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{campaign.budgetType === "daily" ? "Daily" : "Lifetime"} budget</span>
                  </>
                )}
                <StatusBadge tone={metaStatusTone(campaign.status)}>{metaStatusLabel(campaign.status)}</StatusBadge>
              </>
            ) : (
              <span>Campaign</span>
            )}
          </div>
        </div>

        {/* Campaign KPIs (skeleton while the campaign list loads) */}
        <MetaKpiCards
          metrics={campaign?.insights}
          isLoading={campaignsLoading}
          currency={account?.currency}
        />

        {/* Ad sets table */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 space-y-0">
            <CardTitle>Ad Sets</CardTitle>
            {adsets && <Badge variant="secondary">{adsets.length}</Badge>}
          </CardHeader>
          <CardContent>
            {adsetsError ? (
              <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
                <AlertTriangle className="size-4 shrink-0" />
                Failed to load ad sets: {(adsetsError as Error).message}
              </div>
            ) : (
              <AdSetTable
                adsets={adsets}
                isLoading={adsetsLoading}
                accountId={accountId}
                campaignId={campaignId}
                currency={account?.currency}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}

export default function CampaignPage({ params }: CampaignPageProps) {
  return (
    <Suspense fallback={<DashboardShell wide><div className="animate-pulse text-muted-foreground">Loading campaign...</div></DashboardShell>}>
      <CampaignContent accountId={params.accountId} campaignId={params.campaignId} />
    </Suspense>
  );
}
