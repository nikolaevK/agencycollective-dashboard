"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Search, Plus, Check, Database, PencilLine } from "lucide-react";
import { useAdmin } from "@/components/providers/AdminProvider";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { cn } from "@/lib/utils";
import { badgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dialogOverlayClass, dialogPanelClass } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
      className={cn(dialogOverlayClass, "z-[60] flex items-start justify-center overflow-y-auto p-4")}
      onClick={onClose}
    >
      <div
        className={cn(dialogPanelClass, "relative mt-10 w-full max-w-2xl")}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <h2 className="text-base font-medium leading-none">Add Client</h2>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close"
            className="bg-secondary"
          >
            <X />
          </Button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-2">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList className="w-full">
              {!admin.isExternal && (
                <TabsTrigger value="payout">
                  <Database />
                  From Payout DB
                </TabsTrigger>
              )}
              <TabsTrigger value="manual">
                <PencilLine />
                Manual entry
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="p-6">
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
                  <Select value={importWorkspace} onValueChange={setImportWorkspace}>
                    <SelectTrigger
                      title="Workspace the imported client lands in"
                      aria-label="Workspace the imported client lands in"
                      className="w-auto min-w-36"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {workspaces.map((w) => (
                        <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filter brands…"
                    className="pl-9"
                  />
                </div>
              </div>

              {error && (
                <div className={cn("rounded-2xl border px-4 py-3 text-sm", badgeTone.danger)}>
                  {error}
                </div>
              )}

              <div className="max-h-[45vh] overflow-y-auto rounded-2xl ring-1 ring-foreground/5 divide-y">
                {isLoading ? (
                  <div className="p-4 space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
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
                      className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
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
                      <Button
                        size="sm"
                        onClick={() => handleAdd(entry)}
                        disabled={addingBrands.has(entry.normalizedName)}
                      >
                        <Plus />
                        {addingBrands.has(entry.normalizedName) ? "Adding…" : "Add"}
                      </Button>
                    </div>
                  ))
                )}
              </div>

              {addedBrands.size > 0 && (
                <p className={cn("flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm", badgeTone.success)}>
                  <Check className="size-4 shrink-0" />
                  <span>
                    Added {addedBrands.size} client{addedBrands.size !== 1 ? "s" : ""}.
                    Add an email in each client&apos;s settings to enable portal login.
                  </span>
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
