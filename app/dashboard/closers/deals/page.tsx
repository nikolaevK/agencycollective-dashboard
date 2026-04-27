"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, RefreshCw, Search } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { CloserSubNav } from "@/components/closers/CloserSubNav";
import { RecentDealsTable } from "@/components/closers/RecentDealsTable";
import { TimeFrameSelector } from "@/components/shared/TimeFrameSelector";
import { formatCents } from "@/components/closers/types";
import type { DealPublic } from "@/components/closers/types";
import type { DealMetricBucket } from "@/lib/deals";
import { cn } from "@/lib/utils";
import { appendTimeFrameParams, buildTimeFrame, type TimeFrame } from "@/lib/timeFrame";

// In-flight statuses (rescheduled, follow_up, not_closed) are server-filtered
// out of the admin queue — closers manage them in their own portal — so the
// admin only ever pivots between closed and pending_signature here.
type StatusFilter = "all" | "closed" | "pending_signature";
// "needs_review" short-circuits the paid check — it matches deals whose
// invoice is still a draft awaiting admin approval.
type PaidFilter = "all" | "paid" | "unpaid" | "needs_review";

interface AdminDeal extends DealPublic {
  invoiceStatus?: string | null;
  invoiceNumber?: string | null;
  contractStatus?: string | null;
  closerName?: string | null;
  setterName?: string | null;
}

interface TeamStatsEnvelope {
  lifetime: DealMetricBucket;
  window: DealMetricBucket;
  closeRate: number;
}

function needsReview(d: AdminDeal): boolean {
  return d.invoiceStatus === "draft";
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
    refetchInterval: 30_000,
  });

  // Deals fetch — driven by the per-month dropdown.
  const dealBounds = useMemo(() => monthToBounds(dealsMonth), [dealsMonth]);
  const { data: deals = [], isLoading, isFetching } = useQuery<AdminDeal[]>({
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
    refetchInterval: 30_000,
  });

  // Search filters the LIST only (not metrics).
  const baseFiltered = useMemo(() => {
    if (!search.trim()) return deals;
    const q = search.toLowerCase().trim();
    return deals.filter((d) => d.clientName.toLowerCase().includes(q));
  }, [deals, search]);

  const filtered = useMemo(() => {
    let result = baseFiltered;
    if (statusFilter !== "all") result = result.filter((d) => d.status === statusFilter);
    if (paidFilter === "needs_review") result = result.filter(needsReview);
    else if (paidFilter !== "all") result = result.filter((d) => d.paidStatus === paidFilter);
    return result;
  }, [baseFiltered, statusFilter, paidFilter]);

  // Pill counts for the visible LIST (post-search, pre-status/paid).
  const statusBase = useMemo(() => {
    if (paidFilter === "all") return baseFiltered;
    if (paidFilter === "needs_review") return baseFiltered.filter(needsReview);
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
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl lg:text-3xl font-black text-foreground">Deal queue</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Closed and pending-signature deals across your sales team. In-flight deals stay with the closer.
            </p>
          </div>
          <button
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["admin-deals"] });
              queryClient.invalidateQueries({ queryKey: ["admin-deal-queue-metrics"] });
            }}
            disabled={isFetching}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-card text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            Refresh
          </button>
        </div>

        <CloserSubNav />

        {/* Metrics time frame (independent from deal-list month). */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Metrics window</p>
          <TimeFrameSelector value={metricsFrame} onChange={setMetricsFrame} />
        </div>

        {/* Stats row — sourced from /closers/stats with the metrics frame. */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <StatCard label="In your queue" value={String(queueTotal)} sub="closed + pending" />
          <StatCard label="Closed" value={String(queueClosedCount)} valueClass="text-emerald-600 dark:text-emerald-400" />
          <StatCard label="Pending" value={String(queuePendingCount)} valueClass="text-amber-600 dark:text-amber-400" sub="awaiting signature" />
          <StatCard label="Closed revenue" value={formatCents(closedRevenue)} sub="this window" />
          <StatCard label="Paid revenue" value={formatCents(paidRevenue)} valueClass="text-emerald-600 dark:text-emerald-400" sub="cash collected" />
          <StatCard label="Outstanding" value={formatCents(outstanding)} valueClass="text-amber-600 dark:text-amber-400" sub={`${reviewQueueCount} need review`} />
        </div>

        {/* Deal-list month picker — independent from the metrics frame.
            Per-month browsing was the pre-revamp UX; restored so admin can
            audit any month's deals without changing the metrics row above. */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
          <div className="flex flex-col gap-1">
            <label htmlFor="deals-month" className="text-xs font-medium text-muted-foreground">
              Deals from
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <select
                id="deals-month"
                value={dealsMonth}
                onChange={(e) => setDealsMonth(e.target.value)}
                className="flex h-10 rounded-lg border border-input bg-background pl-10 pr-8 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow appearance-none cursor-pointer"
              >
                {monthOptions.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search deals by client name..."
              className="flex h-10 w-full rounded-lg border border-input bg-background pl-10 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
            />
          </div>
          <div className="flex gap-1 rounded-lg bg-muted/50 dark:bg-white/5 p-1 overflow-x-auto">
            {filters.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
                  statusFilter === f.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label} ({f.count})
              </button>
            ))}
          </div>
          <div className="flex gap-1 rounded-lg bg-muted/50 dark:bg-white/5 p-1 overflow-x-auto">
            {paidFilters.map((f) => (
              <button
                key={f.value}
                onClick={() => setPaidFilter(f.value)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
                  paidFilter === f.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title={f.value === "needs_review" ? "Deals with invoice awaiting admin review" : undefined}
              >
                {f.label} ({f.count})
              </button>
            ))}
          </div>
        </div>

        {/* Deals table */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-muted/50 animate-pulse" />
            ))}
          </div>
        ) : (
          <RecentDealsTable deals={filtered} adminMode={true} />
        )}
      </div>
    </DashboardShell>
  );
}

function StatCard({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("text-2xl font-bold mt-1 truncate", valueClass ?? "text-foreground")}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
