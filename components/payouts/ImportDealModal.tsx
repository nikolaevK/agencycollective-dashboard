"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Search, FileText, FileCheck2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ImportableDeal {
  dealId: string;
  clientName: string;
  brandName: string | null;
  dealValue: number; // cents
  closerName: string | null;
  closingDate: string | null;
  serviceCategory: string | null;
  industry: string | null;
  notes: string | null;
  clientEmail: string | null;
  paidStatus: "paid" | "unpaid";
  hasInvoice: boolean;
  alreadyImported: boolean;
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

interface ImportDealModalProps {
  open: boolean;
  onClose: () => void;
  onPick: (deal: ImportableDeal) => void;
}

export function ImportDealModal({ open, onClose, onPick }: ImportDealModalProps) {
  const [search, setSearch] = useState("");

  const { data: deals = [], isLoading, isError } = useQuery<ImportableDeal[]>({
    queryKey: ["importable-deals"],
    queryFn: async () => {
      const res = await fetch("/api/admin/payouts/importable-deals");
      if (!res.ok) throw new Error("Failed to fetch importable deals");
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: open,
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return deals;
    return deals.filter(
      (d) =>
        d.clientName.toLowerCase().includes(q) ||
        (d.brandName ?? "").toLowerCase().includes(q) ||
        (d.closerName ?? "").toLowerCase().includes(q)
    );
  }, [deals, search]);

  if (!open) return null;

  const Badge = ({
    ok,
    label,
    Icon,
  }: {
    ok: boolean;
    label: string;
    Icon: typeof FileText;
  }) => (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium",
        ok
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "bg-muted text-muted-foreground"
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
      {ok ? " ✓" : " —"}
    </span>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 flex w-full md:max-w-2xl max-h-[90vh] flex-col rounded-t-2xl md:rounded-2xl border border-border/50 dark:border-white/[0.06] bg-card shadow-xl md:mx-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 dark:border-white/[0.06] px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Import from Deal
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Closed deals with a signed contract. The signed scope & invoice
              attach automatically.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by client, brand, or closer..."
              className="flex h-10 w-full rounded-lg border border-input bg-background pl-10 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {isLoading && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Loading deals…
            </p>
          )}
          {isError && (
            <p className="py-8 text-center text-sm text-destructive">
              Failed to load deals.
            </p>
          )}
          {!isLoading && !isError && filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No closed + signed deals available to import.
            </p>
          )}
          {filtered.map((deal) => {
            const disabled = deal.alreadyImported;
            return (
              <button
                key={deal.dealId}
                type="button"
                disabled={disabled}
                onClick={() => onPick(deal)}
                className={cn(
                  "w-full text-left rounded-lg border p-3 transition-colors",
                  disabled
                    ? "border-border/50 bg-muted/30 opacity-60 cursor-not-allowed"
                    : "border-border/50 dark:border-white/[0.06] hover:border-primary/50 hover:bg-accent/40"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {deal.brandName || deal.clientName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {deal.closerName ? `${deal.closerName} · ` : ""}
                      {deal.closingDate || "no close date"}
                      {deal.serviceCategory ? ` · ${deal.serviceCategory}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold text-foreground">
                      {formatCents(deal.dealValue)}
                    </p>
                    {deal.paidStatus === "paid" && (
                      <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        Paid
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge ok label="Scope" Icon={FileCheck2} />
                  <Badge ok={deal.hasInvoice} label="Invoice" Icon={FileText} />
                  {disabled && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      <Check className="h-3 w-3" />
                      Imported
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
