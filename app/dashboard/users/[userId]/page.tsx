"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { format, parseISO } from "date-fns";
import {
  ArrowLeft,
  Mail,
  Calendar,
  CalendarClock,
  DollarSign,
  Globe,
  Pencil,
  Link2,
  Eye,
  ExternalLink,
  KeyRound,
  Star,
  Wallet,
  Banknote,
  Layers,
  ChevronDown,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { StatusBadge as ClientStatusBadge } from "@/components/users/StatusBadge";
import { AvatarInitials } from "@/components/users/AvatarInitials";
import { useInsights } from "@/hooks/useInsights";
import { useAccounts } from "@/hooks/useAccounts";
import { useDateRange } from "@/hooks/useDateRange";
import { META_QUERY_STALE_MS } from "@/lib/queryConfig";
import { aggregateInsights } from "@/lib/meta/transformers";
import { cn, formatCurrency, formatRoas, spansMultipleDays } from "@/lib/utils";
import { useState, useMemo } from "react";
import type { ClientPublic } from "@/components/users/types";
import type { ClientAccount } from "@/lib/clientAccounts";
import type { InsightMetrics, TimeSeriesDataPoint } from "@/types/dashboard";
import type { DateRangeInput } from "@/types/api";
import type { BrandHistory } from "@/lib/payouts";
import { OnboardingProgressCard } from "@/components/users/OnboardingProgressCard";
import { ClientOfferActivityCard } from "@/components/offers/admin/ClientOfferActivityCard";
import { useAdmin } from "@/components/providers/AdminProvider";
import { RebillStatusChip } from "@/components/users/RebillStatusChip";
import { formatDate as formatDay } from "@/components/users/format";
import {
  MANUAL_BILLING_LABELS,
  MANUAL_BILLING_TONE,
  toneOf,
} from "@/components/users/rosterPresentation";
import { useClientProfileMutations } from "@/hooks/useClientProfileMutations";
import { StatCard } from "@/components/overview/StatCard";
import { metaStatusLabel, metaStatusTone } from "@/components/overview/metaStatus";
import { SparklinePlaceholder } from "@/components/shared/SparklinePlaceholder";
import type { MetricSparkline as MetricSparklineType } from "@/components/shared/MetricSparkline";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TOUCH_TARGET } from "@/components/ui/touch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StickyTabs } from "@/components/layout/StickyTabs";
import { mergeTimeSeries } from "@/lib/timeseries";
import { foldClientMonths, trendMonths } from "@/lib/clientTrendSeries";
import { businessTodayYmd } from "@/lib/businessTime";

// Lazy: recharts only loads once a trend line / the history chart renders.
const MetricSparkline = dynamic(
  () => import("@/components/shared/MetricSparkline").then((m) => m.MetricSparkline),
  { loading: () => <SparklinePlaceholder /> }
);
const PaymentHistoryChart = dynamic(
  () => import("@/components/users/PaymentHistoryChart").then((m) => m.PaymentHistoryChart),
  { loading: () => <Skeleton className="h-[260px] w-full rounded-2xl" /> }
);
type CardTrend = Omit<React.ComponentProps<typeof MetricSparklineType>, "label">;
// Only shown once "Combined Performance" is expanded (2+ Meta accounts).
const MetaKpiCards = dynamic(() => import("@/components/overview/MetaKpiCards").then((m) => m.MetaKpiCards), {
  loading: () => <Skeleton className="h-[260px] w-full rounded-3xl" />,
});
const MetaPerformanceChart = dynamic(
  () => import("@/components/overview/MetaPerformanceChart").then((m) => m.MetaPerformanceChart),
  { loading: () => <Skeleton className="h-[380px] w-full rounded-3xl" /> }
);

// Lazy: every tab but Overview, and the click-to-open dialogs, load on first
// use — the page's first load ships only the header + Overview.
const ClientBillingTab = dynamic(() => import("@/components/users/ClientBillingTab").then((m) => m.ClientBillingTab), { loading: () => <Skeleton className="h-[420px] w-full rounded-3xl" /> });
const ClientAdAccountsTab = dynamic(() => import("@/components/users/ClientAdAccountsTab").then((m) => m.ClientAdAccountsTab), { loading: () => <Skeleton className="h-[420px] w-full rounded-3xl" /> });
const ClientDocumentsTab = dynamic(() => import("@/components/users/ClientDocumentsTab").then((m) => m.ClientDocumentsTab), { loading: () => <Skeleton className="h-[420px] w-full rounded-3xl" /> });
const ClientNotesTab = dynamic(() => import("@/components/users/ClientNotesTab").then((m) => m.ClientNotesTab), { loading: () => <Skeleton className="h-[420px] w-full rounded-3xl" /> });
const ClientSettingsTab = dynamic(() => import("@/components/users/ClientSettingsTab").then((m) => m.ClientSettingsTab), { loading: () => <Skeleton className="h-[420px] w-full rounded-3xl" /> });
const ClientOnboardingTab = dynamic(() => import("@/components/users/ClientOnboardingTab").then((m) => m.ClientOnboardingTab), { loading: () => <Skeleton className="h-[420px] w-full rounded-3xl" /> });
const BrandAssetsPanel = dynamic(() => import("@/components/assets/BrandAssetsPanel").then((m) => m.BrandAssetsPanel), { loading: () => <Skeleton className="h-[420px] w-full rounded-3xl" /> });
const CreativesGallery = dynamic(() => import("@/components/assets/CreativesGallery").then((m) => m.CreativesGallery), { loading: () => <Skeleton className="h-[420px] w-full rounded-3xl" /> });
const EditClientModal = dynamic(() => import("@/components/users/EditClientModal").then((m) => m.EditClientModal), { ssr: false });
const ManageAccountsModal = dynamic(() => import("@/components/users/ManageAccountsModal").then((m) => m.ManageAccountsModal), { ssr: false });
const MrrDetailModal = dynamic(() => import("@/components/users/MrrDetailModal").then((m) => m.MrrDetailModal), { ssr: false });

interface ClientProfilePageProps {
  params: { userId: string };
  searchParams?: { tab?: string };
}

type DetailTab =
  | "overview"
  | "onboarding"
  | "brand"
  | "creatives"
  | "billing"
  | "adAccounts"
  | "documents"
  | "notes"
  | "settings";

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "onboarding", label: "Onboarding" },
  { id: "brand", label: "My Brand" },
  { id: "creatives", label: "Ad Creatives" },
  { id: "billing", label: "Billing" },
  { id: "adAccounts", label: "Ad Accounts" },
  { id: "documents", label: "Documents" },
  { id: "notes", label: "Notes & Reminders" },
  { id: "settings", label: "Settings" },
];

async function fetchClient(userId: string): Promise<ClientPublic> {
  const res = await fetch("/api/admin/users");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const clients = json.data as ClientPublic[];
  const client = clients.find((c) => c.id === userId);
  if (!client) throw new Error("Client not found");
  return client;
}

/** The Billing tab's query (same key + payload): payment history for the
 *  Overview's chart and card trend lines. */
interface BillingHistoryResponse {
  history: BrandHistory[];
}

async function fetchBilling(userId: string): Promise<BillingHistoryResponse> {
  const res = await fetch(`/api/admin/clients/${userId}/billing`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data as BillingHistoryResponse;
}

function formatMrr(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

// Billed = chart-1, collected = chart-2 (the closed / paid pair).
const BLUE = "hsl(var(--chart-1))";
const GREEN = "hsl(var(--chart-2))";

// ---------- Mini KPI card per linked account ----------

function AccountKpiCard({ account }: { account: ClientAccount }) {
  const { dateRange } = useDateRange();
  const { data, isLoading } = useInsights(account.accountId, dateRange);
  const { data: metaAccounts } = useAccounts(dateRange);
  const router = useRouter();

  // Show real Meta account status instead of internal is_active flag
  const metaAccount = metaAccounts?.find((a) => a.id === account.accountId);
  const metaStatus = metaAccount?.status;

  return (
    <Card
      onClick={() => router.push(`/dashboard/accounts/${account.accountId}`)}
      className="group cursor-pointer transition-colors hover:bg-muted/50"
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3 md:pb-3">
        <div className="min-w-0">
          <CardTitle className="truncate text-sm">
            {account.label || metaAccount?.name || account.accountId}
          </CardTitle>
          {(account.label || metaAccount?.name) && (
            <CardDescription className="font-mono text-xs">{account.accountId}</CardDescription>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {metaStatus ? (
            <StatusBadge tone={metaStatusTone(metaStatus)}>{metaStatusLabel(metaStatus)}</StatusBadge>
          ) : !account.isActive ? (
            <StatusBadge tone="neutral">Unlinked</StatusBadge>
          ) : null}
          <ExternalLink className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-5 w-16" />
              </div>
            ))}
          </div>
        ) : data ? (
          <dl className="grid grid-cols-3 gap-3">
            <MiniStat label="Spend" value={formatCurrency(data.metrics.spend)} />
            <MiniStat label="ROAS" value={formatRoas(data.metrics.roas)} />
            <MiniStat label="Conv." value={new Intl.NumberFormat("en-US").format(data.metrics.conversions)} />
          </dl>
        ) : (
          <p className="text-xs text-muted-foreground">No data available</p>
        )}
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-base font-semibold tracking-tight tabular-nums">{value}</dd>
    </div>
  );
}

// ---------- Combined performance with chart ----------

/** Fetch combined time series for multiple accounts via a single React Query call. */
async function fetchCombinedTimeSeries(
  accountIds: string[],
  dateRange: { preset?: string; since?: string; until?: string }
): Promise<TimeSeriesDataPoint[]> {
  const results = await Promise.all(
    accountIds.map(async (accountId) => {
      const params = new URLSearchParams({ accountId, timeSeries: "true" });
      if (dateRange.preset) params.set("preset", dateRange.preset);
      else if (dateRange.since && dateRange.until) {
        params.set("since", dateRange.since);
        params.set("until", dateRange.until);
      }
      const res = await fetch(`/api/insights?${params.toString()}`);
      if (!res.ok) return undefined;
      const json = await res.json();
      return json.data?.timeSeries as TimeSeriesDataPoint[] | undefined;
    })
  );
  return mergeTimeSeries(results);
}

function CombinedPerformanceSection({
  accounts,
  aggregated,
  previous,
  dateRange,
}: {
  accounts: ClientAccount[];
  aggregated: InsightMetrics;
  /** Summed previous-period totals of the same accounts (Δ chips). */
  previous: InsightMetrics | null;
  dateRange: DateRangeInput;
}) {
  const [expanded, setExpanded] = useState(false);

  const accountIds = useMemo(() => accounts.map((a) => a.accountId), [accounts]);

  const { data: mergedTimeSeries, isLoading: tsLoading, error: tsError } = useQuery({
    queryKey: ["admin-combined-ts", accountIds, dateRange],
    queryFn: () => fetchCombinedTimeSeries(accountIds, dateRange),
    enabled: expanded && accountIds.length > 0,
    staleTime: META_QUERY_STALE_MS,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="group block w-full rounded-[min(calc(var(--radius)*2.6),24px)] text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
      >
        <Card className="transition-colors group-hover:bg-muted/50">
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-3 md:pb-3">
            <div className="flex min-w-0 items-center gap-2">
              <Layers className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <CardTitle className="text-sm">Combined Performance</CardTitle>
                <CardDescription className="text-xs">
                  {accounts.length} accounts aggregated{!expanded && " — click to expand"}
                </CardDescription>
              </div>
            </div>
            <ChevronDown
              className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
            />
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-3 gap-4 sm:grid-cols-5">
              <MiniStat label="Spend" value={formatCurrency(aggregated.spend)} />
              <MiniStat label="ROAS" value={formatRoas(aggregated.roas)} />
              <MiniStat label="Conversions" value={new Intl.NumberFormat("en-US").format(aggregated.conversions)} />
              <MiniStat label="Revenue" value={formatCurrency(aggregated.conversionValue)} className="hidden sm:block" />
              <MiniStat label="CPC" value={formatCurrency(aggregated.cpc)} className="hidden sm:block" />
            </dl>
          </CardContent>
        </Card>
      </button>

      {expanded && (
        <>
          <MetaKpiCards
            metrics={aggregated}
            previous={previous}
            timeSeries={mergedTimeSeries}
            showTrend={spansMultipleDays(dateRange)}
          />

          <MetaPerformanceChart
            data={mergedTimeSeries}
            isLoading={tsLoading}
            error={tsError as Error | null}
            description="Combined performance over time"
          />
        </>
      )}
    </div>
  );
}

// ---------- Main page ----------

export default function ClientProfilePage({ params, searchParams }: ClientProfilePageProps) {
  const router = useRouter();
  const [showEdit, setShowEdit] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);
  const [showMrrDetail, setShowMrrDetail] = useState(false);
  const { isExternal } = useAdmin();
  const { patchProfile } = useClientProfileMutations();
  // ?tab=… deep-links a tab (e.g. the directory's Ad Accounts count column).
  const [tab, setTab] = useState<DetailTab>(() =>
    DETAIL_TABS.some((t) => t.id === searchParams?.tab)
      ? (searchParams!.tab as DetailTab)
      : "overview"
  );

  const { dateRange } = useDateRange();
  const { data: allMetaAccounts } = useAccounts(dateRange);

  const { data: client, isLoading, refetch } = useQuery({
    queryKey: ["admin-user", params.userId],
    queryFn: () => fetchClient(params.userId),
    staleTime: 0,
  });

  // Payment history (shared with the Billing tab's query) — the Overview's
  // chart and the MRR / revenue card trend lines.
  const { data: billing, isLoading: billingLoading, isError: billingError } = useQuery({
    queryKey: ["client-billing", params.userId],
    queryFn: () => fetchBilling(params.userId),
    staleTime: 30_000,
  });
  const history = useMemo(() => {
    if (!billing) return undefined;
    // Same business-timezone month window as the directory's trend lines.
    const months = trendMonths(businessTodayYmd().slice(0, 7));
    const s = foldClientMonths(params.userId, months, billing.history.map((h) => h.months), []);
    return { months, billed: s.billed, collected: s.collected };
  }, [billing, params.userId]);
  const cardTrends = useMemo(() => {
    if (!history) return null;
    const line = (values: number[], color: string, hint: string): CardTrend => ({
      points: values.map((value, i) => ({ label: format(parseISO(`${history.months[i]}-01`), "MMM yyyy"), value })),
      color,
      format: formatMrr,
      caption: "Last 12 months",
      hint,
    });
    return {
      billed: line(history.billed, BLUE, "Billed"),
      collected: line(history.collected, GREEN, "Collected"),
    };
  }, [history]);

  // Aggregate metrics across user's linked accounts
  const aggregated = useMemo(() => {
    if (!client || !allMetaAccounts || client.accounts.length < 2) return undefined;
    const userIds = new Set(client.accounts.map((a) => a.accountId));
    const matched = allMetaAccounts.filter((a) => userIds.has(a.id));
    if (matched.length < 2) return undefined;
    const previous = matched.flatMap((a) => (a.previous ? [a.previous] : []));
    return {
      metrics: aggregateInsights(matched.map((a) => a.insights)),
      previous: previous.length > 0 ? aggregateInsights(previous) : null,
    };
  }, [client, allMetaAccounts]);

  if (isLoading) {
    return (
      <DashboardShell>
        <div className="space-y-6">
          <Skeleton className="h-8 w-36" />
          <div className="flex items-center gap-4">
            <Skeleton className="size-14 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-7 w-56" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            {[1, 2, 3, 4, 5].map((i) => (
              <Card key={i}>
                <CardContent className="space-y-2 p-4 md:p-6">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-28" />
                  <Skeleton className="h-3 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Skeleton className="h-9 w-full max-w-2xl rounded-full" />
          <Skeleton className="h-[320px] w-full rounded-3xl" />
        </div>
      </DashboardShell>
    );
  }

  if (!client) {
    return (
      <DashboardShell>
        <Card>
          <CardContent className="p-12 text-center md:p-12">
            <p className="text-sm text-muted-foreground">Client not found.</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/dashboard/users")}
              className="mt-3 text-muted-foreground"
            >
              <ArrowLeft />
              Back to Clients
            </Button>
          </CardContent>
        </Card>
      </DashboardShell>
    );
  }

  const isPepads = client.profile.book === "pepads";
  const mrrClickable = client.payoutMrr > 0 && !isExternal;
  const displayedAccounts = client.accounts.filter((a) => a.isActive).length;
  const sparkFallback = billingLoading ? <SparklinePlaceholder /> : null;

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/dashboard/users")}
            className="-ml-3 mb-4 text-muted-foreground"
          >
            <ArrowLeft />
            Back to Clients
          </Button>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
              {client.logoPath ? (
                <img
                  src={client.logoPath}
                  alt={client.displayName}
                  className="size-14 shrink-0 rounded-2xl object-contain ring-1 ring-foreground/5"
                />
              ) : (
                <AvatarInitials name={client.displayName} className="w-14 h-14 text-lg shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="min-w-0 break-words text-2xl font-semibold tracking-tight lg:text-3xl">
                    {client.displayName}
                  </h2>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={patchProfile.isPending}
                    onClick={() =>
                      // Through the shared mutations hook: per-client write
                      // queue (no race with inline directory edits) + the
                      // ["admin-users"] cache invalidation the directory needs.
                      patchProfile.mutate(
                        {
                          userId: client.id,
                          changes: { isTop: !client.profile.isTop },
                        },
                        { onSettled: () => refetch() }
                      )
                    }
                    title={
                      client.profile.isTop
                        ? "Unpin from Top Clients"
                        : "Mark as top client"
                    }
                    aria-label="Toggle top client"
                  >
                    <Star
                      className={cn(
                        "transition-colors",
                        client.profile.isTop
                          ? "text-amber-500 fill-amber-500"
                          : "text-muted-foreground/50 hover:text-amber-500"
                      )}
                    />
                  </Button>
                  <ClientStatusBadge status={client.status} />
                  {isPepads ? (
                    <>
                      <Badge variant="outline">PepAds</Badge>
                      {client.profile.manualBilling.length > 0 ? (
                        client.profile.manualBilling.map((v) => (
                          <StatusBadge key={v} tone={toneOf(MANUAL_BILLING_TONE, v)}>
                            {MANUAL_BILLING_LABELS[v] ?? v}
                          </StatusBadge>
                        ))
                      ) : (
                        <StatusBadge tone="neutral">Manual billing</StatusBadge>
                      )}
                    </>
                  ) : (
                    <RebillStatusChip status={client.schedule.status} paid={client.schedule.paid} />
                  )}
                  {!client.email && <StatusBadge tone="warning">No email</StatusBadge>}
                  {!client.analystEnabled && (
                    <StatusBadge tone="neutral" title="AI Analyst access has been disabled for this client">
                      AI Off
                    </StatusBadge>
                  )}
                  {client.designBoardEnabled && client.designBoardUrl && (
                    <StatusBadge tone="info" title="Design Board (Figma) is live in this client's portal">
                      Design Board
                    </StatusBadge>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {client.email && (
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Mail className="size-3.5 shrink-0" />
                      <span className="truncate">{client.email}</span>
                    </span>
                  )}
                  {client.profile.website && (
                    <a
                      href={
                        /^https?:\/\//i.test(client.profile.website)
                          ? client.profile.website
                          : `https://${client.profile.website}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        TOUCH_TARGET,
                        "flex min-w-0 items-center gap-1.5 text-foreground underline-offset-4 hover:underline [@media(pointer:coarse)]:after:-inset-y-1.5"
                      )}
                    >
                      <Globe className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{client.profile.website}</span>
                    </a>
                  )}
                  {client.category && <Badge variant="secondary">{client.category}</Badge>}
                  <span className="flex items-center gap-1.5">
                    <Calendar className="size-3.5" />
                    Joined {formatDay(client.joinedAt ?? client.createdAt)}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setShowEdit(true)}>
                <Pencil />
                Edit
              </Button>
              <Button variant="outline" onClick={() => setShowAccounts(true)}>
                <Link2 />
                Manage Accounts
              </Button>
              {client.slug && (
                <Button asChild>
                  <a
                    href={`/${client.slug}/portal/overview`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Eye />
                    View Portal
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard
            label="Monthly MRR"
            icon={DollarSign}
            value={formatMrr(client.payoutMrr)}
            sub={mrrClickable ? "View payout history" : "From the Payout DB"}
            onClick={mrrClickable ? () => setShowMrrDetail(true) : undefined}
          >
            {cardTrends ? <MetricSparkline label="Billed per month" {...cardTrends.billed} /> : sparkFallback}
          </StatCard>
          <StatCard
            label="Total Revenue"
            icon={Wallet}
            value={formatMrr(client.totalRevenue)}
            sub="Collected, all time"
          >
            {cardTrends ? <MetricSparkline label="Collected per month" {...cardTrends.collected} /> : sparkFallback}
          </StatCard>
          <StatCard
            label={isPepads ? "Next Re-bill (manual)" : "Next Re-bill"}
            icon={CalendarClock}
            value={
              isPepads
                ? client.profile.manualNextRebill
                  ? formatDay(client.profile.manualNextRebill)
                  : "—"
                : client.schedule.nextRebillAt
                  ? formatDay(client.schedule.nextRebillAt)
                  : "—"
            }
            sub={
              // PepAds billing is manual — never show the computed schedule.
              isPepads
                ? "Billed manually"
                : client.schedule.lastRebilledAt
                  ? `Last billed ${formatDay(client.schedule.lastRebilledAt)}`
                  : "Not billed yet"
            }
          />
          <StatCard
            label="Linked Accounts"
            icon={Banknote}
            value={String(client.accounts.length)}
            sub={`${displayedAccounts} displayed in the portal`}
          />
          <StatCard
            label="Password"
            icon={KeyRound}
            value={client.hasPassword ? "Set" : "Pending"}
            delta={
              <StatusBadge tone={client.hasPassword ? "success" : "warning"}>
                {client.hasPassword ? "Portal ready" : "Not set"}
              </StatusBadge>
            }
            sub="Client portal login"
            className="col-span-2 lg:col-span-1"
          />
        </div>

        {/* Tab strip — sticky on phones; a ?tab= deep link scrolls it up */}
        <StickyTabs value={tab} onValueChange={(v) => setTab(v as DetailTab)} scrollOnMount={tab !== "overview"}>
          <div className="overflow-x-auto">
            <TabsList>
              {DETAIL_TABS.map((t) => (
                <TabsTrigger key={t.id} value={t.id}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </StickyTabs>

        {tab === "overview" && (
          <div className="space-y-6">
            <Card>
              <CardHeader className="flex flex-col gap-1 space-y-0 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                <div className="flex items-center gap-2">
                  <DollarSign className="size-4 text-muted-foreground" />
                  <CardTitle>Payment History</CardTitle>
                </div>
                <CardDescription className="text-xs">Payout DB · last 12 months</CardDescription>
              </CardHeader>
              <CardContent>
                {history ? (
                  <PaymentHistoryChart months={history.months} billed={history.billed} collected={history.collected} />
                ) : billingError ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Couldn&apos;t load the payment history.
                  </p>
                ) : (
                  <Skeleton className="h-[260px] w-full rounded-2xl" />
                )}
              </CardContent>
            </Card>

            {/* Call prep: which of our other services they've been looking at */}
            {!isExternal && <ClientOfferActivityCard userId={params.userId} />}

            {/* Onboarding Progress */}
            <OnboardingProgressCard userId={params.userId} />

            {/* Linked accounts with KPIs */}
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium">Linked Meta Accounts</h3>
                  <p className="text-xs text-muted-foreground">
                    Click an account to view its full dashboard.
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowAccounts(true)}>
                  <Link2 />
                  Manage
                </Button>
              </div>

              {/* Aggregated summary with expandable chart — only when 2+ accounts */}
              {aggregated && (
                <CombinedPerformanceSection
                  accounts={client.accounts}
                  aggregated={aggregated.metrics}
                  previous={aggregated.previous}
                  dateRange={dateRange}
                />
              )}

              {client.accounts.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center gap-2 p-8 text-center md:p-8">
                    <Banknote className="size-6 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      No Meta accounts linked yet.{" "}
                      <Button
                        variant="link"
                        onClick={() => setShowAccounts(true)}
                        className={cn("h-auto p-0 align-baseline", TOUCH_TARGET, "[@media(pointer:coarse)]:after:-inset-y-1.5")}
                      >
                        Add one
                      </Button>
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {client.accounts.map((account) => (
                    <AccountKpiCard key={account.id} account={account} />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {tab === "onboarding" && <ClientOnboardingTab userId={params.userId} />}
        {tab === "brand" && (
          <BrandAssetsPanel apiBase={`/api/admin/clients/${params.userId}/assets`} viewer="admin" />
        )}
        {tab === "creatives" && (
          <CreativesGallery apiBase={`/api/admin/clients/${params.userId}/assets`} canUpload />
        )}
        {tab === "billing" && (
          <ClientBillingTab
            userId={params.userId}
            clientName={client.displayName}
            clientEmail={client.email}
            onChanged={() => refetch()}
            isPepads={isPepads}
          />
        )}
        {tab === "adAccounts" && (
          <ClientAdAccountsTab userId={params.userId} clientName={client.displayName} />
        )}
        {tab === "documents" && <ClientDocumentsTab userId={params.userId} />}
        {tab === "notes" && <ClientNotesTab userId={params.userId} />}
        {tab === "settings" && (
          <ClientSettingsTab
            client={client}
            onEdit={() => setShowEdit(true)}
            onManageAccounts={() => setShowAccounts(true)}
            onChanged={() => refetch()}
          />
        )}

        {/* Modals */}
        {showEdit && (
          <EditClientModal
            client={client}
            onClose={() => setShowEdit(false)}
            onUpdated={() => refetch()}
          />
        )}
        {showAccounts && (
          <ManageAccountsModal
            client={client}
            onClose={() => setShowAccounts(false)}
            onUpdated={() => refetch()}
          />
        )}
        {showMrrDetail && (
          <MrrDetailModal
            open={showMrrDetail}
            onClose={() => setShowMrrDetail(false)}
            clientName={client.displayName}
            mrrCents={client.payoutMrr}
          />
        )}
      </div>
    </DashboardShell>
  );
}
