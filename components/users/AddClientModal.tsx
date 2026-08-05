"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Search, Plus, Check, Database, PencilLine } from "lucide-react";
import { useAdmin } from "@/components/providers/AdminProvider";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { cn } from "@/lib/utils";
import { CreateUserForm } from "./CreateUserForm";
import { DateRangeDropdown, type DateRangeValue } from "./DateRangeDropdown";
import { CATEGORIES, type PayoutPoolEntry } from "./types";
import { formatMoney, formatDate } from "./format";

type Tab = "payout" | "manual";

function fmtLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function last7(): DateRangeValue {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 6);
  return { from: fmtLocal(from), to: fmtLocal(today) };
}

/** Map a free-form payout vertical onto a known category, else null. */
function verticalToCategory(vertical: string | null): string | null {
  if (!vertical) return null;
  const match = CATEGORIES.find(
    (c) => c.toLowerCase() === vertical.trim().toLowerCase()
  );
  return match ?? null;
}

async function fetchPool(range: DateRangeValue): Promise<PayoutPoolEntry[]> {
  const params = new URLSearchParams();
  if (range.from) params.set("since", range.from);
  if (range.to) params.set("until", range.to);
  const res = await fetch(`/api/admin/clients/payout-pool?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data as PayoutPoolEntry[];
}

export function AddClientModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const queryClient = useQueryClient();
  const admin = useAdmin();
  // The Payout DB is internal-only — external partner admins add manually.
  const [tab, setTab] = useState<Tab>(admin.isExternal ? "manual" : "payout");
  const { workspaces } = useWorkspaces();
  const [importWorkspace, setImportWorkspace] = useState<string>("main");
  const [range, setRange] = useState<DateRangeValue>(last7());
  const [search, setSearch] = useState("");
  const [addingBrands, setAddingBrands] = useState<Set<string>>(new Set());
  const [addedBrands, setAddedBrands] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const { data: pool = [], isLoading } = useQuery({
    queryKey: ["admin-payout-pool", range.from, range.to],
    queryFn: () => fetchPool(range),
    enabled: tab === "payout",
    staleTime: 60_000,
  });

  const filteredPool = pool.filter(
    (p) =>
      !addedBrands.has(p.normalizedName) &&
      (search.trim() === "" ||
        p.brandName.toLowerCase().includes(search.toLowerCase()))
  );

  async function handleAdd(entry: PayoutPoolEntry) {
    if (addingBrands.has(entry.normalizedName)) return; // guard double-submit
    setError(null);
    setAddingBrands((prev) => new Set(prev).add(entry.normalizedName));
    try {
      const res = await fetch("/api/admin/clients/from-payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName: entry.brandName,
          dateJoined: entry.dateJoined,
          monthlyAmount: entry.monthlyAmount,
          category: verticalToCategory(entry.vertical),
          workspace: importWorkspace,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setAddedBrands((prev) => new Set(prev).add(entry.normalizedName));
      // Drop the brand from the pool so a stale list can't re-add it.
      queryClient.invalidateQueries({ queryKey: ["admin-payout-pool"] });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add client");
    } finally {
      setAddingBrands((prev) => {
        const next = new Set(prev);
        next.delete(entry.normalizedName);
        return next;
      });
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative mt-10 w-full max-w-2xl rounded-2xl bg-card shadow-xl border border-border/50"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border/50">
          <h2 className="text-lg font-bold text-foreground">Add Client</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-2 bg-muted/40 dark:bg-white/5 m-5 mb-0 rounded-xl">
          {!admin.isExternal && (
            <TabBtn active={tab === "payout"} onClick={() => setTab("payout")} icon={Database}>
              From Payout DB
            </TabBtn>
          )}
          <TabBtn active={tab === "manual"} onClick={() => setTab("manual")} icon={PencilLine}>
            Manual entry
          </TabBtn>
        </div>

        <div className="p-5">
          {tab === "payout" ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Pick a brand from the Payout DB that isn&apos;t in the directory yet.
                Date joined and MRR are pulled from the payout record. Defaults to
                the past week — widen the range to find older brands.
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <DateRangeDropdown label="Joined window" value={range} onChange={setRange} />
                {workspaces.length > 1 && (
                  <select
                    value={importWorkspace}
                    onChange={(e) => setImportWorkspace(e.target.value)}
                    title="Workspace the imported client lands in"
                    className="rounded-lg bg-muted/40 dark:bg-white/5 border border-border/50 px-2.5 py-2 text-xs font-semibold text-foreground focus:outline-none"
                  >
                    {workspaces.map((w) => (
                      <option key={w.value} value={w.value}>{w.label}</option>
                    ))}
                  </select>
                )}
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filter brands…"
                    className="w-full pl-9 pr-4 py-2 bg-background border rounded-md text-sm shadow-sm focus:ring-2 focus:ring-primary/20 focus:outline-none"
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="max-h-[45vh] overflow-y-auto rounded-xl border border-border/50 divide-y divide-border/30">
                {isLoading ? (
                  <div className="p-6 space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-12 w-full animate-pulse rounded-lg bg-muted/60" />
                    ))}
                  </div>
                ) : filteredPool.length === 0 ? (
                  <p className="p-8 text-center text-sm text-muted-foreground">
                    No unlinked payout brands in this window.
                  </p>
                ) : (
                  filteredPool.map((entry) => (
                    <div
                      key={entry.normalizedName}
                      className="flex items-center justify-between gap-3 p-3 hover:bg-muted/20 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {entry.brandName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Joined {formatDate(entry.dateJoined)}
                          {entry.vertical ? ` · ${entry.vertical}` : ""}
                          {entry.monthlyAmount > 0
                            ? ` · ${formatMoney(entry.monthlyAmount)}/mo`
                            : ""}
                        </p>
                      </div>
                      <button
                        onClick={() => handleAdd(entry)}
                        disabled={addingBrands.has(entry.normalizedName)}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white shadow-sm ac-gradient hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 shrink-0"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {addingBrands.has(entry.normalizedName) ? "Adding…" : "Add"}
                      </button>
                    </div>
                  ))
                )}
              </div>

              {addedBrands.size > 0 && (
                <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                  <Check className="h-4 w-4" />
                  Added {addedBrands.size} client{addedBrands.size !== 1 ? "s" : ""}.
                  Add an email in each client&apos;s settings to enable portal login.
                </p>
              )}
            </div>
          ) : (
            <CreateUserForm
              onCreated={() => {
                queryClient.invalidateQueries({ queryKey: ["admin-payout-pool"] });
                onCreated();
                onClose();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Database;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all",
        active
          ? "bg-card dark:bg-white/10 text-primary shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}
