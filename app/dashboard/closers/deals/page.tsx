"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { CloserSubNav } from "@/components/closers/CloserSubNav";
import { RecentDealsTable } from "@/components/closers/RecentDealsTable";
import { formatCents } from "@/components/closers/types";
import type { DealPublic } from "@/components/closers/types";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "closed" | "not_closed" | "pending_signature" | "rescheduled" | "follow_up";

export default function AdminDealsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const { data: deals = [], isLoading } = useQuery<DealPublic[]>({
    queryKey: ["admin-all-deals"],
    queryFn: async () => {
      const res = await fetch("/api/admin/deals");
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const filtered = useMemo(() => {
    let result = deals;
    if (statusFilter !== "all") {
      result = result.filter((d) => d.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter((d) =>
        d.clientName.toLowerCase().includes(q)
      );
    }
    return result;
  }, [deals, statusFilter, search]);

  // Stats
  const totalValue = deals.filter((d) => d.status === "closed").reduce((s, d) => s + d.dealValue, 0);
  const closedCount = deals.filter((d) => d.status === "closed").length;
  const notClosedCount = deals.filter((d) => d.status === "not_closed").length;
  const pendingCount = deals.filter((d) => d.status === "pending_signature").length;
  const rescheduledCount = deals.filter((d) => d.status === "rescheduled").length;
  const followUpCount = deals.filter((d) => d.status === "follow_up").length;

  const filters: { value: StatusFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: deals.length },
    { value: "closed", label: "Closed", count: closedCount },
    { value: "not_closed", label: "Not Closed", count: notClosedCount },
    { value: "pending_signature", label: "Pending", count: pendingCount },
    { value: "rescheduled", label: "Rescheduled", count: rescheduledCount },
    { value: "follow_up", label: "Follow Up", count: followUpCount },
  ];

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl lg:text-3xl font-black text-foreground">All Deals</h2>
          <p className="text-sm text-muted-foreground mt-1">
            View and manage all deals across your sales team
          </p>
        </div>

        <CloserSubNav />

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">Total Deals</p>
            <p className="text-2xl font-bold text-foreground mt-1">{deals.length}</p>
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
