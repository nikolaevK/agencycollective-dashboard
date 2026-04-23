"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Calendar, RefreshCw } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { CloserSubNav } from "@/components/closers/CloserSubNav";
import { RecentDealsTable } from "@/components/closers/RecentDealsTable";
import { formatCents } from "@/components/closers/types";
import type { DealPublic } from "@/components/closers/types";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "closed" | "pending_signature" | "rescheduled" | "follow_up";
// Second group combines payment + review state since they're mutually-picked
// filters (one pill lights up at a time). "needs_review" short-circuits the
// paid check and matches deals whose invoice is still a draft.
type PaidFilter = "all" | "paid" | "unpaid" | "needs_review";

interface AdminDeal extends DealPublic {
  invoiceStatus?: string | null;
  invoiceNumber?: string | null;
  contractStatus?: string | null;
  closerName?: string | null;
  setterName?: string | null;
}

/**
 * A deal "needs review" when its auto-generated invoice is still a draft —
 * admin needs to approve and send. Matches the "Review" label used by
 * DealInvoiceStatusBadge in admin mode.
 */
function needsReview(d: AdminDeal): boolean {
  return d.invoiceStatus === "draft";
}

function currentMonthStartISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

/** Current year-month in YYYY-MM, matching how deal dates are sliced. */
function currentMonthKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function getMonthOptions(deals: DealPublic[]): { value: string; label: string }[] {
  const months = new Set<string>();
  // Current month is always selectable even if it has no deals yet — the
  // page defaults to it.
  months.add(currentMonthKey());
  for (const d of deals) {
    const dateStr = d.closingDate || d.createdAt;
    if (dateStr) months.add(dateStr.slice(0, 7)); // YYYY-MM
  }
  const sorted = [...months].sort().reverse();
  return sorted.map((m) => {
    const [y, mo] = m.split("-");
    const label = new Date(Number(y), Number(mo) - 1).toLocaleDateString("en-US", { year: "numeric", month: "long" });
    return { value: m, label };
  });
}

export default function AdminDealsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  // Default to the current month so admins see the working set first. "all"
  // stays available in the dropdown for when they want the full history.
  const [monthFilter, setMonthFilter] = useState<string>(() => currentMonthKey());
  const [paidFilter, setPaidFilter] = useState<PaidFilter>("all");

  const queryClient = useQueryClient();
  // Stable-for-the-session boundary so both queries use the same cutoff.
  const [monthStart] = useState<string>(() => currentMonthStartISO());

  // Two-phase load for perf: fetch current month first (small, fast —
  // what admins interact with most), then older deals in the background.
  // Merging is client-side.
  const currentQuery = useQuery<AdminDeal[]>({
    queryKey: ["admin-deals", "current", monthStart],
    queryFn: async () => {
      const res = await fetch(`/api/admin/deals?since=${monthStart}`);
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  const olderQuery = useQuery<AdminDeal[]>({
    queryKey: ["admin-deals", "older", monthStart],
    queryFn: async () => {
      const res = await fetch(`/api/admin/deals?until=${monthStart}`);
      const json = await res.json();
      return json.data ?? [];
    },
    // Older data changes less frequently — longer cache, slower refresh.
    staleTime: 2 * 60_000,
    refetchInterval: 2 * 60_000,
  });

  const deals = useMemo<AdminDeal[]>(
    () => [...(currentQuery.data ?? []), ...(olderQuery.data ?? [])],
    [currentQuery.data, olderQuery.data]
  );
  const isLoading = currentQuery.isLoading;
  const isFetching = currentQuery.isFetching || olderQuery.isFetching;
  const olderLoading = olderQuery.isLoading;

  const monthOptions = useMemo(() => getMonthOptions(deals), [deals]);

  // Stage 1: month + search (used for tab counts and stats)
  const baseFiltered = useMemo(() => {
    let result = deals;
    if (monthFilter !== "all") {
      result = result.filter((d) => {
        const dateStr = d.closingDate || d.createdAt;
        return dateStr?.startsWith(monthFilter);
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter((d) =>
        d.clientName.toLowerCase().includes(q)
      );
    }
    return result;
  }, [deals, monthFilter, search]);

  // Stage 2: + status + paid/review filter (used for table display). The
  // "needs_review" value in paidFilter short-circuits the payment check —
  // it's a review predicate, not a paid-status predicate.
  const filtered = useMemo(() => {
    let result = baseFiltered;
    if (statusFilter !== "all") result = result.filter((d) => d.status === statusFilter);
    if (paidFilter === "needs_review") result = result.filter(needsReview);
    else if (paidFilter !== "all") result = result.filter((d) => d.paidStatus === paidFilter);
    return result;
  }, [baseFiltered, statusFilter, paidFilter]);

  // For status pill counts: apply paid/review filter so counts reflect the selection.
  const statusBase = useMemo(() => {
    if (paidFilter === "all") return baseFiltered;
    if (paidFilter === "needs_review") return baseFiltered.filter(needsReview);
    return baseFiltered.filter((d) => d.paidStatus === paidFilter);
  }, [baseFiltered, paidFilter]);

  // For paid pill counts: apply status filter so counts reflect the status selection
  const paidBase = useMemo(() => {
    if (statusFilter === "all") return baseFiltered;
    return baseFiltered.filter((d) => d.status === statusFilter);
  }, [baseFiltered, statusFilter]);

  // Stats based on month+search filtered deals
  const totalValue = baseFiltered.filter((d) => d.status === "closed").reduce((s, d) => s + d.dealValue, 0);
  const closedCount = statusBase.filter((d) => d.status === "closed").length;
  const pendingCount = statusBase.filter((d) => d.status === "pending_signature").length;
  const rescheduledCount = statusBase.filter((d) => d.status === "rescheduled").length;
  const followUpCount = statusBase.filter((d) => d.status === "follow_up").length;
  const paidCount = paidBase.filter((d) => d.paidStatus === "paid").length;
  const unpaidCount = paidBase.filter((d) => d.paidStatus === "unpaid").length;

  const filters: { value: StatusFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: statusBase.length },
    { value: "closed", label: "Closed", count: closedCount },
    { value: "pending_signature", label: "Pending", count: pendingCount },
    { value: "rescheduled", label: "Rescheduled", count: rescheduledCount },
    { value: "follow_up", label: "Follow Up", count: followUpCount },
  ];

  const reviewCount = paidBase.filter(needsReview).length;
  const paidFilters: { value: PaidFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: paidBase.length },
    { value: "paid", label: "Paid", count: paidCount },
    { value: "unpaid", label: "Unpaid", count: unpaidCount },
    { value: "needs_review", label: "Needs review", count: reviewCount },
  ];

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl lg:text-3xl font-black text-foreground">All Deals</h2>
            <p className="text-sm text-muted-foreground mt-1">
              View and manage all deals across your sales team
            </p>
          </div>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ["admin-deals"] })}
            disabled={isFetching}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-card text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            Refresh
          </button>
        </div>

        <CloserSubNav />

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">Total Deals</p>
            <p className="text-2xl font-bold text-foreground mt-1">{baseFiltered.length}</p>
          </div>
          <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">Closed Revenue</p>
            <p className="text-2xl font-bold text-foreground mt-1">{formatCents(totalValue)}</p>
          </div>
          <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">Closed</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{closedCount}</p>
          </div>
          <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">Pending</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{pendingCount}</p>
          </div>
        </div>

        {/* Search + filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search deals by client name..."
              className="flex h-10 w-full rounded-lg border border-input bg-background pl-10 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
            />
          </div>
          <div className="relative shrink-0">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="flex h-10 rounded-lg border border-input bg-background pl-10 pr-8 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow appearance-none cursor-pointer"
            >
              <option value="all">All Months</option>
              {monthOptions.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
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

        {olderLoading && !isLoading && (
          <p className="text-xs text-muted-foreground">Loading older deals in the background…</p>
        )}

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
