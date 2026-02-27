"use client";

import { Suspense } from "react";
import { useAdSets } from "@/hooks/useAdSets";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useDateRange } from "@/hooks/useDateRange";
import { useAccounts } from "@/hooks/useAccounts";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { DrilldownBreadcrumb } from "@/components/drilldown/DrilldownBreadcrumb";
import { AdSetTable } from "@/components/drilldown/AdSetTable";
import { KpiGrid } from "@/components/overview/KpiGrid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

interface CampaignPageProps {
  params: { accountId: string; campaignId: string };
}

function CampaignContent({ accountId, campaignId }: { accountId: string; campaignId: string }) {
  const { dateRange } = useDateRange();
  const { data: accounts } = useAccounts(dateRange);
  const { data: campaigns } = useCampaigns(accountId, dateRange);
  const { data: adsets, isLoading: adsetsLoading, error: adsetsError } = useAdSets(campaignId, dateRange);

  const account = accounts?.find((a) => a.id === accountId);
  const campaign = campaigns?.find((c) => c.id === campaignId);
  const accountName = account?.name ?? accountId;
  const campaignName = campaign?.name ?? campaignId;

  return (
    <DashboardShell>
      <div className="space-y-6">
        <DrilldownBreadcrumb
          items={[
            { label: accountName, href: `/dashboard/accounts/${accountId}` },
            { label: campaignName },
          ]}
        />

        <div>
          <h1 className="text-2xl font-bold line-clamp-1">{campaignName}</h1>
          {campaign && (
            <p className="text-sm text-muted-foreground">
              {campaign.objective} · {campaign.status}
              {campaign.budget > 0 && ` · ${campaign.budgetType === "daily" ? "Daily" : "Lifetime"} budget`}
            </p>
          )}
        </div>

        {/* Campaign KPIs */}
        {campaign && (
          <KpiGrid
            metrics={campaign.insights}
            isLoading={false}
            currency={account?.currency}
          />
        )}

        {/* Ad sets table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Ad Sets
              {adsets && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({adsets.length})
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {adsetsError ? (
              <div className="flex items-center gap-2 text-destructive text-sm">
                <AlertTriangle className="h-4 w-4" />
                Failed to load ad sets: {(adsetsError as Error).message}
              </div>
            ) : (
              <AdSetTable
                adsets={adsets}
                isLoading={adsetsLoading}
                accountId={accountId}
                campaignId={campaignId}
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
    <Suspense fallback={<DashboardShell><div className="animate-pulse text-muted-foreground">Loading campaign...</div></DashboardShell>}>
      <CampaignContent accountId={params.accountId} campaignId={params.campaignId} />
    </Suspense>
  );
}
