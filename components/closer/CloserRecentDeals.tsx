"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Link2, Pencil, StickyNote, Briefcase, Search } from "lucide-react";
import { formatCents } from "@/components/closers/types";
import type { DealPublic } from "@/components/closers/types";
import { useQueryClient } from "@tanstack/react-query";
import { UnifiedDealForm } from "@/components/shared/UnifiedDealForm";
import { DealInfoModal } from "@/components/shared/DealInfoModal";
import { DealInvoiceStatusBadge } from "@/components/closers/DealInvoiceStatusBadge";
import { DealContractStatusBadge } from "@/components/closers/DealContractStatusBadge";
import { format, startOfWeek, startOfMonth } from "date-fns";

type RangeFilter = "all" | "week" | "month";

const STATUS_STYLES: Record<string, string> = {
  closed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  not_closed: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  pending_signature: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  rescheduled: "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
  follow_up: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
};

const STATUS_LABELS: Record<string, string> = {
  closed: "Closed",
  not_closed: "Not Closed",
  pending_signature: "Pending",
  rescheduled: "Rescheduled",
  follow_up: "Follow Up",
};

function DealStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide",
        STATUS_STYLES[status] ?? STATUS_STYLES.follow_up
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function parseDealDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  // Date-only "YYYY-MM-DD" → construct as local midnight so timezone doesn't shift the date
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const dt = new Date(raw);
  return isNaN(dt.getTime()) ? null : dt;
}

function formatDate(dateStr: string | null): string {
  const d = parseDealDate(dateStr);
  if (!d) return "\u2014";
  try {
    return format(d, "MMM d, yyyy");
  } catch {
    return dateStr ?? "";
  }
}

interface DealWithInvoice extends DealPublic {
  invoiceStatus?: string | null;
  invoiceNumber?: string | null;
  contractStatus?: string | null;
  setterName?: string | null;
}

interface Props {
  deals: DealWithInvoice[];
}

export function CloserRecentDeals({ deals }: Props) {
  const [editDeal, setEditDeal] = useState<DealPublic | null>(null);
  const [infoModal, setInfoModal] = useState<{ type: "notes" | "services"; deal: DealPublic } | null>(null);
  const [range, setRange] = useState<RangeFilter>("all");
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const filtered = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const monthStart = startOfMonth(now);
    const q = search.trim().toLowerCase();

    return deals.filter((d) => {
      if (q) {
        const name = d.clientName.toLowerCase();
        const brand = (d.brandName ?? "").toLowerCase();
        if (!name.includes(q) && !brand.includes(q)) return false;
      }
      if (range === "all") return true;
      const dt = parseDealDate(d.closingDate) ?? parseDealDate(d.createdAt);
      if (!dt) return false;
      if (range === "week") return dt >= weekStart;
      if (range === "month") return dt >= monthStart;
      return true;
    });
  }, [deals, range, search]);

  const totalCount = deals.length;
  const showingCount = filtered.length;

  function handleSaved() {
    setEditDeal(null);
    queryClient.invalidateQueries({ queryKey: ["closer-stats"] });
    queryClient.invalidateQueries({ queryKey: ["closer-deals"] });
  }

  return (
    <>
    <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card">
      <div className="p-5 border-b border-border/50 dark:border-white/[0.06] space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Deals</h3>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {showingCount === totalCount ? `${totalCount}` : `${showingCount} of ${totalCount}`}
          </span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="inline-flex items-center rounded-lg bg-muted/60 p-0.5 text-xs font-medium">
            {(["all", "week", "month"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setRange(key)}
                aria-pressed={range === key}
                className={cn(
                  "rounded-md px-3 py-1.5 transition-colors",
                  range === key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {key === "all" ? "All" : key === "week" ? "This Week" : "This Month"}
              </button>
            ))}
          </div>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by client or brand"
              className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
            />
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {totalCount === 0 ? "No deals yet. Create your first deal!" : "No deals match your filters."}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 dark:border-white/[0.06]">
                  <th className="text-left font-medium text-muted-foreground px-5 py-3">Client</th>
                  <th className="text-left font-medium text-muted-foreground px-5 py-3">Amount</th>
                  <th className="text-left font-medium text-muted-foreground px-5 py-3">Status</th>
                  <th className="text-left font-medium text-muted-foreground px-5 py-3">Date</th>
                  <th className="text-right font-medium text-muted-foreground px-5 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((deal) => (
                  <tr
                    key={deal.id}
                    className="border-b border-border/50 dark:border-white/[0.06] last:border-0 hover:bg-muted/50 transition-colors"
                  >
                    <td className="px-5 py-3 font-medium text-foreground">
                      <div>
                        <span className="inline-flex items-center gap-1.5">
                          {deal.clientName}
                          {deal.clientUserId && <Link2 className="h-3 w-3 text-primary shrink-0" />}
                          {deal.notes && (
                            <button onClick={() => setInfoModal({ type: "notes", deal })} className="shrink-0 text-amber-500 hover:text-amber-600 transition-colors" title="View notes">
                              <StickyNote className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {deal.serviceCategory && (
                            <button onClick={() => setInfoModal({ type: "services", deal })} className="shrink-0 text-violet-500 hover:text-violet-600 transition-colors" title="View services">
                              <Briefcase className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </span>
                        {(deal.brandName || deal.website) && (
                          <div className="flex items-center gap-2 mt-0.5">
                            {deal.brandName && <span className="text-xs text-muted-foreground font-normal">{deal.brandName}</span>}
                            {deal.website && (
                              <a href={deal.website.startsWith("http") ? deal.website : `https://${deal.website}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate max-w-[180px] font-normal">
                                {deal.website.replace(/^https?:\/\//, "")}
                              </a>
                            )}
                          </div>
                        )}
                        {deal.setterName && (
                          <div className="text-[11px] text-muted-foreground font-normal mt-0.5">
                            Set by {deal.setterName}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 font-semibold text-foreground">{formatCents(deal.dealValue)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <DealStatusBadge status={deal.status} />
                        {deal.invoiceStatus && (
                          <DealInvoiceStatusBadge status={deal.invoiceStatus} />
                        )}
                        {deal.contractStatus && (
                          <DealContractStatusBadge status={deal.contractStatus} />
                        )}
                        <span className={cn(
                          "inline-flex items-center shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide whitespace-nowrap",
                          deal.paidStatus === "paid"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                            : "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400"
                        )}>
                          {deal.paidStatus === "paid" ? "Paid" : "Unpaid"}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{formatDate(deal.closingDate || deal.createdAt)}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => setEditDeal(deal)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden max-h-[60vh] overflow-y-auto divide-y divide-border/50 dark:divide-white/[0.06]">
            {filtered.map((deal) => (
              <div key={deal.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-foreground truncate">{deal.clientName}</p>
                    {deal.notes && (
                      <button onClick={() => setInfoModal({ type: "notes", deal })} className="shrink-0 text-amber-500" title="View notes">
                        <StickyNote className="h-3 w-3" />
                      </button>
                    )}
                    {deal.serviceCategory && (
                      <button onClick={() => setInfoModal({ type: "services", deal })} className="shrink-0 text-violet-500" title="View services">
                        <Briefcase className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  {(deal.brandName || deal.website) && (
                    <div className="flex items-center gap-2 mt-0.5">
                      {deal.brandName && <span className="text-xs text-muted-foreground">{deal.brandName}</span>}
                      {deal.website && (
                        <a href={deal.website.startsWith("http") ? deal.website : `https://${deal.website}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate max-w-[150px]">
                          {deal.website.replace(/^https?:\/\//, "")}
                        </a>
                      )}
                    </div>
                  )}
                  {deal.setterName && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Set by {deal.setterName}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDate(deal.closingDate || deal.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <DealStatusBadge status={deal.status} />
                  {deal.invoiceStatus && (
                    <DealInvoiceStatusBadge status={deal.invoiceStatus} />
                  )}
                  {deal.contractStatus && (
                    <DealContractStatusBadge status={deal.contractStatus} />
                  )}
                  <span className={cn(
                    "inline-flex items-center shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide whitespace-nowrap",
                    deal.paidStatus === "paid"
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                      : "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400"
                  )}>
                    {deal.paidStatus === "paid" ? "Paid" : "Unpaid"}
                  </span>
                  <span className="text-sm font-semibold text-foreground">
                    {formatCents(deal.dealValue)}
                  </span>
                  <button
                    onClick={() => setEditDeal(deal)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>

    {/* Info modal (notes / services) */}
    {infoModal && (
      <DealInfoModal
        title={infoModal.type === "notes" ? `Notes — ${infoModal.deal.clientName}` : `Services — ${infoModal.deal.clientName}`}
        type={infoModal.type}
        content={infoModal.type === "notes" ? infoModal.deal.notes : infoModal.deal.serviceCategory}
        onClose={() => setInfoModal(null)}
      />
    )}

    {/* Edit modal */}
    {editDeal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditDeal(null)} />
        <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-border bg-card shadow-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h3 className="text-lg font-semibold text-foreground">Edit Deal</h3>
            <button onClick={() => setEditDeal(null)} className="text-muted-foreground hover:text-foreground">
              <span className="sr-only">Close</span>&times;
            </button>
          </div>
          <div className="p-6">
            <UnifiedDealForm
              mode="edit"
              context="closer"
              initialData={editDeal}
              onSuccess={handleSaved}
              onCancel={() => setEditDeal(null)}
            />
          </div>
        </div>
      </div>
    )}
    </>
  );
}
