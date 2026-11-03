"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, RefreshCw, Search } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { CloserSubNav } from "@/components/closers/CloserSubNav";
import { RecentDealsTable } from "@/components/closers/RecentDealsTable";
import { DealDraftsPanel } from "@/components/closers/DealDraftsPanel";
import { AdminNewDeal } from "@/components/closers/AdminNewDeal";
import { DealPrepPlaybookButton } from "@/components/closers/DealPrepPlaybook";
import type { DealAgentPrepBadgeData } from "@/components/closers/DealAgentPrepBadge";
import { TimeFrameSelector } from "@/components/shared/TimeFrameSelector";
import { formatCents } from "@/components/closers/types";
import type { DealPublic } from "@/components/closers/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { DealMetricBucket } from "@/lib/deals";
import { cn } from "@/lib/utils";
import { appendTimeFrameParams, buildTimeFrame, type TimeFrame } from "@/lib/timeFrame";

// In-flight statuses (rescheduled, follow_up, not_closed) are server-filtered
// out of the admin queue — closers manage them in their own portal — so the
// admin only ever pivots between closed and pending_signature here.
type StatusFilter = "all" | "closed" | "pending_signature";
// "needs_review" short-circuits the paid check — it matches deals whose
// invoice is still a draft awaiting admin approval. "agent_ready" = the
// deal-prep agent finished preparing it (ready, or flagged for input).
type PaidFilter = "all" | "paid" | "unpaid" | "needs_review" | "agent_ready";

interface AdminDeal extends DealPublic {
  invoiceStatus?: string | null;
  invoiceNumber?: string | null;
  contractStatus?: string | null;
  closerName?: string | null;
  setterName?: string | null;
  agentPrep?: DealAgentPrepBadgeData | null;
}

interface TeamStatsEnvelope {
  lifetime: DealMetricBucket;
  window: DealMetricBucket;
  closeRate: number;
}

function needsReview(d: AdminDeal): boolean {
  return d.invoiceStatus === "draft";
}

function agentReady(d: AdminDeal): boolean {
  return d.agentPrep?.status === "ready" || d.agentPrep?.status === "needs_input";
}

/** Build a list of selectable months going back N months from now. The
 *  per-month dropdown drives the deal-list scope independently from the
 *  metrics window — admin can be looking at "this quarter" metrics while
 *  the table shows just March's deals, for example. */
function buildMonthOptions(monthsBack = 24): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [{ value: "all", label: "All months" }];
  const now = new Date();
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const value = `${y}-${m}`;
    const label = d.toLocaleDateString("en-US", { year: "numeric", month: "long" });
    out.push({ value, label });
  }
  return out;
}

/** Resolve a month dropdown value to since/until for the API. */
function monthToBounds(monthValue: string): { since?: string; until?: string } {
  if (monthValue === "all") return {};
  const [yStr, mStr] = monthValue.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return {};
  const lastDay = new Date(y, m, 0).getDate(); // 0th day of next month = last day of this month
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    since: `${y}-${pad(m)}-01`,
    until: `${y}-${pad(m)}-${pad(lastDay)}`,
  };
}

export default function AdminDealsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [paidFilter, setPaidFilter] = useState<PaidFilter>("all");
  // Time frame for headline METRICS — independent from the deal-list month.
  const [metricsFrame, setMetricsFrame] = useState<TimeFrame>(() => buildTimeFrame("month"));
  // Per-month picker for the DEAL LIST. Defaults to current month so the
  // page boots showing this month's deals, but admin can pivot to any
  // earlier month without affecting the metrics row.
  const monthOptions = useMemo(() => buildMonthOptions(24), []);
  const [dealsMonth, setDealsMonth] = useState<string>(() => monthOptions[1]?.value ?? "all");

  const queryClient = useQueryClient();

  // Metrics fetch — independent of the deal list. Uses /closers/stats so
  // headline cards reflect the metrics window even when admin is browsing
  // a different month's deals below.
  const { data: stats } = useQuery<TeamStatsEnvelope>({
    queryKey: ["admin-deal-queue-metrics", metricsFrame.key, metricsFrame.since ?? "", metricsFrame.until ?? ""],
    queryFn: async () => {
      const url = appendTimeFrameParams("/api/admin/closers/stats", metricsFrame);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load metrics: ${res.status}`);
      const json = await res.json();
      return json.data;
    },
    staleTime: 30_000,
    // 120s matches the closer/setter dashboards. Window-focus refetch (30s
    // staleTime) keeps the page fresh when the admin actually looks at it.
    refetchInterval: 120_000,
  });

  // Deals fetch — driven by the per-month dropdown.
  const dealBounds = useMemo(() => monthToBounds(dealsMonth), [dealsMonth]);
  const { data: deals = [], isLoading, isFetching, isLoadingError, refetch } = useQuery<AdminDeal[]>({
    queryKey: ["admin-deals", dealsMonth],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dealBounds.since) params.set("since", dealBounds.since);
      if (dealBounds.until) params.set("until", dealBounds.until);
      const qs = params.toString();
      const res = await fetch(`/api/admin/deals${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error(`Failed to load deals: ${res.status}`);
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 30_000,
    refetchInterval: 120_000,
  });

  // Search filters the LIST only (not metrics).
  const baseFiltered = useMemo(() => {
    if (!search.trim()) return deals;
    const q = search.toLowerCase().trim();
    return deals.filter((d) =>
      [d.clientName, d.brandName, d.closerName, d.invoiceNumber].some((v) => v?.toLowerCase().includes(q))
    );
  }, [deals, search]);

  const filtered = useMemo(() => {
    let result = baseFiltered;
    if (statusFilter !== "all") result = result.filter((d) => d.status === statusFilter);
    if (paidFilter === "needs_review") result = result.filter(needsReview);
    else if (paidFilter === "agent_ready") result = result.filter(agentReady);
    else if (paidFilter !== "all") result = result.filter((d) => d.paidStatus === paidFilter);
    return result;
  }, [baseFiltered, statusFilter, paidFilter]);

  // Pill counts for the visible LIST (post-search, pre-status/paid).
  const statusBase = useMemo(() => {
    if (paidFilter === "all") return baseFiltered;
    if (paidFilter === "needs_review") return baseFiltered.filter(needsReview);
    if (paidFilter === "agent_ready") return baseFiltered.filter(agentReady);
    return baseFiltered.filter((d) => d.paidStatus === paidFilter);
  }, [baseFiltered, paidFilter]);
  const paidBase = useMemo(() => {
    if (statusFilter === "all") return baseFiltered;
    return baseFiltered.filter((d) => d.status === statusFilter);
  }, [baseFiltered, statusFilter]);

  const closedCount = statusBase.filter((d) => d.status === "closed").length;
  const pendingCount = statusBase.filter((d) => d.status === "pending_signature").length;
  const paidCount = paidBase.filter((d) => d.paidStatus === "paid").length;
  const unpaidCount = paidBase.filter((d) => d.paidStatus === "unpaid").length;
  const reviewCount = paidBase.filter(needsReview).length;
  const agentReadyCount = paidBase.filter(agentReady).length;
  // List-level review count (independent of any pill selection) — shown
  // below the metrics row so admin always sees "what's waiting on me" for
  // the visible month.
  const reviewQueueCount = baseFiltered.filter(needsReview).length;

  const filters: { value: StatusFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: statusBase.length },
    { value: "closed", label: "Closed", count: closedCount },
    { value: "pending_signature", label: "Pending", count: pendingCount },
  ];
  const paidFilters: { value: PaidFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: paidBase.length },
    { value: "paid", label: "Paid", count: paidCount },
    { value: "unpaid", label: "Unpaid", count: unpaidCount },
    { value: "needs_review", label: "Needs review", count: reviewCount },
    // Only once the agent has prepared something — no empty pill otherwise.
    ...(agentReadyCount > 0 || paidFilter === "agent_ready"
      ? [{ value: "agent_ready" as const, label: "Agent ready", count: agentReadyCount }]
      : []),
  ];

  // Headline metrics — sourced from /closers/stats so they reflect the
  // metrics frame, NOT the deal list month.
  const w = stats?.window;
  const closedRevenue = w?.closedRevenue ?? 0;
  const paidRevenue = w?.paidRevenue ?? 0;
  const outstanding = w?.outstandingRevenue ?? 0;
  const queueClosedCount = w?.closedCount ?? 0;
  const queuePendingCount = w?.pendingCount ?? 0;
  const queueTotal = queueClosedCount + queuePendingCount;

  return (
    <DashboardShell wide>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-2xl lg:text-3xl font-semibold tracking-tight">Deal queue</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Closed and pending-signature deals across your sales team. In-flight deals stay with the closer.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DealPrepPlaybookButton />
            <AdminNewDeal />
            <Button
              variant="outline"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["admin-deals"] });
                queryClient.invalidateQueries({ queryKey: ["admin-deal-queue-metrics"] });
              }}
              disabled={isFetching}
            >
              <RefreshCw className={cn(isFetching && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        <CloserSubNav />

        {/* Metrics time frame (independent from deal-list month). */}
        <div>
          <p className="text-sm font-medium mb-2">Metrics window</p>
          <TimeFrameSelector value={metricsFrame} onChange={setMetricsFrame} />
        </div>

        {/* Stats row — sourced from /closers/stats with the metrics frame. */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <StatCard label="In your queue" value={String(queueTotal)} sub="closed + pending" />
          <StatCard label="Closed" value={String(queueClosedCount)} dot="bg-emerald-500" />
          <StatCard label="Pending" value={String(queuePendingCount)} dot="bg-amber-500" sub="awaiting signature" />
          <StatCard label="Closed revenue" value={formatCents(closedRevenue)} sub="this window" />
          <StatCard label="Paid revenue" value={formatCents(paidRevenue)} dot="bg-emerald-500" sub="cash collected" />
          <StatCard label="Outstanding" value={formatCents(outstanding)} dot="bg-amber-500" sub={`${reviewQueueCount} need review`} />
        </div>

        {/* Agent-proposed deals awaiting approval (v1 / MCP createDealDraft).
            Renders nothing when there are none. */}
        <DealDraftsPanel />

        {/* Deal-list month picker — independent from the metrics frame.
            Per-month browsing was the pre-revamp UX; restored so admin can
            audit any month's deals without changing the metrics row above. */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
          <div className="grid gap-2">
            <Label htmlFor="deals-month">Deals from</Label>
            <Select value={dealsMonth} onValueChange={(v) => setDealsMonth(v)}>
              <SelectTrigger id="deals-month" className="w-auto min-w-[12rem] gap-2">
                <Calendar className="size-4 shrink-0 text-muted-foreground" />
                <SelectValue className="flex-1 text-left" />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative w-full sm:w-auto sm:flex-1 sm:min-w-[200px]">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by client, brand, closer or invoice #..."
              className="pl-9"
            />
          </div>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={statusFilter}
            onValueChange={(v) => { if (v) setStatusFilter(v as StatusFilter); }}
            className="max-w-full overflow-x-auto"
          >
            {/* shrink-0: on a narrow phone the pills scroll sideways instead
                of squeezing until the labels spill out of their borders. */}
            {filters.map((f) => (
              <ToggleGroupItem key={f.value} value={f.value} className="shrink-0 px-3">
                {f.label} ({f.count})
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={paidFilter}
            onValueChange={(v) => { if (v) setPaidFilter(v as PaidFilter); }}
            className="max-w-full overflow-x-auto"
          >
            {paidFilters.map((f) => (
              <ToggleGroupItem
                key={f.value}
                value={f.value}
                className="shrink-0 px-3"
                title={
                  f.value === "needs_review"
                    ? "Deals with invoice awaiting admin review"
                    : f.value === "agent_ready"
                      ? "Invoice + contract prepared by the deal-prep agent — review and send"
                      : undefined
                }
              >
                {f.label} ({f.count})
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {/* Deals table */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : isLoadingError ? (
          // Only when nothing has loaded yet — a failed background refetch
          // keeps showing the last good list rather than "No deals yet".
          <Card>
            <CardContent className="p-12 md:p-12 text-center">
              <p className="text-sm font-medium text-destructive">Couldn&apos;t load deals.</p>
              <Button
                variant="outline"
                onClick={() => refetch()}
                disabled={isFetching}
                className="mt-3"
              >
                <RefreshCw className={cn(isFetching && "animate-spin")} />
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : (
          <RecentDealsTable deals={filtered} adminMode={true} title="Deals" />
        )}
      </div>
    </DashboardShell>
  );
}

function StatCard({
  label,
  value,
  sub,
  dot,
}: {
  label: string;
  value: string;
  sub?: string;
  /** Status dot color (e.g. bg-emerald-500) — keeps the old good/attention cue. */
  dot?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2 md:pb-2">
        <CardDescription className="flex items-center gap-1.5">
          {dot && <span className={cn("size-1.5 shrink-0 rounded-full", dot)} />}
          {label}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-xl sm:text-2xl font-semibold tracking-tight tabular-nums truncate">{value}</div>
        {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
      </CardContent>
    </Card>
  );
}
