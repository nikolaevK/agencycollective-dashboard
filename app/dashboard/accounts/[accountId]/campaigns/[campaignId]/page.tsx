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
      <div className="space-y-8">
        <DrilldownBreadcrumb
          items={[
            { label: accountName, href: `/dashboard/accounts/${accountId}` },
            { label: campaignName },
          ]}
        />

        {/* Header */}
        <div>
          {/* Mobile */}
          <div className="lg:hidden">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Campaign</p>
            <h1 className="text-xl font-bold text-foreground truncate">{campaignName}</h1>
            {campaign && (
              <p className="text-[11px] text-muted-foreground mt-1">
                {campaign.objective} · {campaign.status}
              </p>
            )}
          </div>
          {/* Desktop */}
          <div className="hidden lg:block">
            <h2 className="text-3xl font-light text-foreground">
              Campaign <span className="font-bold text-primary line-clamp-1">{campaignName}</span>
            </h2>
            {campaign && (
              <p className="text-sm text-muted-foreground mt-1">
                {campaign.objective} · {campaign.status}
                {campaign.budget > 0 && ` · ${campaign.budgetType === "daily" ? "Daily" : "Lifetime"} budget`}
              </p>
            )}
          </div>
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
        <div className="bg-card rounded-2xl shadow-sm border border-border/50 dark:border-white/[0.06] overflow-hidden px-4 py-5 lg:px-8 lg:py-6">
          <div className="flex items-center justify-between mb-6">
            <h4 className="text-sm font-semibold uppercase tracking-wider lg:text-xl lg:font-bold lg:normal-case lg:tracking-normal text-foreground">
              Ad Sets
            </h4>
            {adsets && (
              <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-[10px] font-bold">
                {adsets.length}
              </span>
            )}
          </div>
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
        </div>
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
