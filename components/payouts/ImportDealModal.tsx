"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Search, FileText, FileCheck2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/format";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dialogOverlayClass, dialogPanelClass } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

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
  isSigned: boolean;
  paidStatus: "paid" | "unpaid";
  hasInvoice: boolean;
  alreadyImported: boolean;
}

interface ImportDealModalProps {
  open: boolean;
  onClose: () => void;
  onPick: (deal: ImportableDeal) => void;
}

export function ImportDealModal({ open, onClose, onPick }: ImportDealModalProps) {
  const [search, setSearch] = useState("");

  // The modal stays mounted while closed — start each opening with a fresh search.
  useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  useEscapeKey(onClose, open);

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

  const DocBadge = ({
    ok,
    label,
    Icon,
  }: {
    ok: boolean;
    label: string;
    Icon: typeof FileText;
  }) => (
    <Badge variant="outline" className="gap-1 font-medium">
      <Icon className={ok ? "text-emerald-500" : "text-muted-foreground"} />
      {label}
      {ok ? " ✓" : " —"}
    </Badge>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
      <div
        className={dialogOverlayClass}
        onClick={onClose}
      />
      <div
        className={cn(
          dialogPanelClass,
          "relative z-50 flex w-full md:max-w-2xl max-h-[90dvh] flex-col rounded-b-none md:rounded-b-4xl md:mx-4"
        )}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 px-6 pt-6">
          <div className="min-w-0 space-y-1.5">
            <h3 className="text-base font-medium leading-none">
              Import from Deal
            </h3>
            <p className="text-sm text-muted-foreground">
              Closed deals that are signed or marked paid. Any signed scope &
              invoice attach automatically.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 bg-secondary"
          >
            <X />
          </Button>
        </div>

        {/* Search */}
        <div className="shrink-0 px-6 pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by client, brand, or closer..."
              className="pl-9"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-4 space-y-2">
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
              {deals.length > 0
                ? `No matches for "${search.trim()}"`
                : "No closed deals available to import."}
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
                  "w-full text-left rounded-2xl border p-3 outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/30",
                  disabled
                    ? "bg-muted/30 opacity-60 cursor-not-allowed"
                    : "hover:bg-muted/50"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {deal.brandName || deal.clientName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {deal.closerName ? `${deal.closerName} · ` : ""}
                      {deal.closingDate || "no close date"}
                      {deal.serviceCategory ? ` · ${deal.serviceCategory}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular-nums">
                      {formatCents(deal.dealValue)}
                    </p>
                    {deal.paidStatus === "paid" && (
                      <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        Paid
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <DocBadge ok={deal.isSigned} label="Scope" Icon={FileCheck2} />
                  <DocBadge ok={deal.hasInvoice} label="Invoice" Icon={FileText} />
                  {disabled && (
                    <Badge variant="secondary" className="gap-1 font-medium">
                      <Check />
                      Imported
                    </Badge>
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
