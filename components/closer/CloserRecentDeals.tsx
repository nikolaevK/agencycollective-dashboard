"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { DealStatusBadge } from "@/components/closers/DealStatusBadge";
import { Link2, Pencil, StickyNote, Briefcase, Search, Trash2 } from "lucide-react";
import { formatCents } from "@/components/closers/types";
import type { DealPublic } from "@/components/closers/types";
import type { DealStatus } from "@/lib/deals";
import { useQueryClient } from "@tanstack/react-query";
import { UnifiedDealForm } from "@/components/shared/UnifiedDealForm";
import { DealInfoModal } from "@/components/shared/DealInfoModal";
import { DealInvoiceStatusBadge } from "@/components/closers/DealInvoiceStatusBadge";
import { DealContractStatusBadge } from "@/components/closers/DealContractStatusBadge";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { format, startOfWeek, startOfMonth } from "date-fns";

type RangeFilter = "all" | "week" | "month";

type StatusFilter = "closed" | "sent" | "paid" | "viewed";

/** Toggleable status chips. Multiple active chips AND together, so
 *  "Closed + Paid" narrows to closed deals that are also paid. */
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "closed", label: "Closed" },
  { value: "sent", label: "Invoice Sent" },
  { value: "paid", label: "Paid" },
  { value: "viewed", label: "Contract Viewed" },
];

function matchesStatusFilter(deal: DealWithInvoice, filter: StatusFilter): boolean {
  switch (filter) {
    case "closed":
      return deal.status === "closed";
    case "sent":
      return deal.invoiceStatus === "sent";
    case "paid":
      return deal.paidStatus === "paid";
    case "viewed":
      return deal.contractStatus === "viewed";
  }
}


function parseDealDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  // Date-only "YYYY-MM-DD" → construct as local midnight so timezone doesn't shift the date
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  // SQLite datetime('now') stamps "YYYY-MM-DD HH:MM:SS" — Safari rejects the
  // space separator, so normalize to ISO "T" before parsing.
  const dt = new Date(raw.replace(" ", "T"));
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
  /** Admin "view as" mode — edit/delete hit closer-session endpoints, so
   *  mutation controls must not render for admins. */
  readOnly?: boolean;
}

// Closers can delete in-flight deals; closed and pending_signature deals
// belong to the admin queue (server enforces the same rule). Typed against
// DealStatus so a future status addition gets a TS nudge here too.
const DELETABLE_STATUSES: ReadonlySet<DealStatus> = new Set([
  "rescheduled",
  "follow_up",
  "not_closed",
]);

/* ── Edit Deal Modal ── (same guards as the admin one in RecentDealsTable) */
function EditDealModal({
  deal,
  onClose,
  onSaved,
}: {
  deal: DealPublic;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Backdrop / × / Escape are easy to hit by accident — confirm before
  // throwing edits away, and never close mid-save (the result would be lost).
  function requestClose() {
    if (saving) return;
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    onClose();
  }

  // Stays registered while saving (requestClose no-ops) so Escape is absorbed
  // here instead of falling through to a layer underneath.
  useEscapeKey(requestClose);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={requestClose} />
      <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-border bg-card shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border bg-card rounded-t-2xl">
          <h3 className="text-lg font-semibold text-foreground">Edit Deal</h3>
          <button
            onClick={requestClose}
            disabled={saving}
            className="-mr-2 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <span className="sr-only">Close</span>&times;
          </button>
        </div>
        <div className="p-4 sm:p-6">
          <UnifiedDealForm
            key={deal.id}
            mode="edit"
            context="closer"
            initialData={deal}
            onSuccess={onSaved}
            onCancel={onClose}
            onDirtyChange={setDirty}
            onPendingChange={setSaving}
          />
        </div>
      </div>
    </div>
  );
}

export function CloserRecentDeals({ deals, readOnly }: Props) {
  const [editDeal, setEditDeal] = useState<DealPublic | null>(null);
  const [infoModal, setInfoModal] = useState<{ type: "notes" | "services"; deal: DealPublic } | null>(null);
  const [range, setRange] = useState<RangeFilter>("all");
  const [statusFilters, setStatusFilters] = useState<ReadonlySet<StatusFilter>>(new Set());
  const [search, setSearch] = useState("");

  function toggleStatusFilter(filter: StatusFilter) {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(filter)) next.delete(filter);
      else next.add(filter);
      return next;
    });
  }
  // Set instead of single string so two concurrent deletes don't visually
  // re-enable each other's buttons mid-flight.
  const [deletingIds, setDeletingIds] = useState<ReadonlySet<string>>(new Set());
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
      for (const filter of statusFilters) {
        if (!matchesStatusFilter(d, filter)) return false;
      }
      if (range === "all") return true;
      const dt = parseDealDate(d.closingDate) ?? parseDealDate(d.createdAt);
      if (!dt) return false;
      if (range === "week") return dt >= weekStart;
      if (range === "month") return dt >= monthStart;
      return true;
    });
  }, [deals, range, statusFilters, search]);

  const totalCount = deals.length;
  const showingCount = filtered.length;

  function handleSaved() {
    setEditDeal(null);
    queryClient.invalidateQueries({ queryKey: ["closer-stats"] });
    queryClient.invalidateQueries({ queryKey: ["closer-deals"] });
  }

  async function handleDelete(deal: DealPublic) {
    if (!DELETABLE_STATUSES.has(deal.status)) return;
    if (!window.confirm(`Delete the deal for ${deal.clientName}? This cannot be undone.`)) return;
    setDeletingIds((prev) => new Set(prev).add(deal.id));
    try {
      const res = await fetch(`/api/closer/deals?id=${encodeURIComponent(deal.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        window.alert(json.error ?? "Failed to delete deal.");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["closer-stats"] });
      queryClient.invalidateQueries({ queryKey: ["closer-deals"] });
    } catch {
      // Network failure / abort. Without this catch the rejection escapes,
      // the button quietly re-enables, and the user sees no feedback at all.
      window.alert("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(deal.id);
        return next;
      });
    }
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
        <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Status filters">
          {STATUS_FILTERS.map((opt) => {
            const active = statusFilters.has(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleStatusFilter(opt.value)}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center h-7 px-2.5 rounded-full text-[11px] font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                {opt.label}
              </button>
            );
          })}
          {statusFilters.size > 0 && (
            <button
              type="button"
              onClick={() => setStatusFilters(new Set())}
              className="inline-flex items-center h-7 px-2 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}
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
          <div className="hidden md:block max-h-[60dvh] overflow-auto">
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
                        <DealStatusBadge status={deal.status} compact />
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
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-0.5">
                        {!readOnly && (
                        <button
                          onClick={() => setEditDeal(deal)}
                          aria-label="Edit deal"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        )}
                        {!readOnly && DELETABLE_STATUSES.has(deal.status) && (
                          <button
                            onClick={() => handleDelete(deal)}
                            disabled={deletingIds.has(deal.id)}
                            aria-label="Delete deal"
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards — stacked rows: the badge/amount/actions cluster
              used to sit beside the name as one non-shrinking row, which
              squeezed the client name to nothing and overflowed the card. */}
          <div className="md:hidden max-h-[60dvh] overflow-y-auto overscroll-contain divide-y divide-border/50 dark:divide-white/[0.06]">
            {filtered.map((deal) => (
              <div key={deal.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{deal.clientName}</p>
                    {(deal.brandName || deal.website) && (
                      <div className="flex items-center gap-2 mt-0.5 min-w-0">
                        {deal.brandName && <span className="min-w-0 truncate text-xs text-muted-foreground">{deal.brandName}</span>}
                        {deal.website && (
                          <a href={deal.website.startsWith("http") ? deal.website : `https://${deal.website}`} target="_blank" rel="noopener noreferrer" className="min-w-0 text-xs text-primary hover:underline truncate max-w-[150px]">
                            {deal.website.replace(/^https?:\/\//, "")}
                          </a>
                        )}
                      </div>
                    )}
                    {deal.setterName && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        Set by {deal.setterName}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(deal.closingDate || deal.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="mr-1 text-sm font-semibold text-foreground">
                      {formatCents(deal.dealValue)}
                    </span>
                    {!readOnly && (
                    <button
                      onClick={() => setEditDeal(deal)}
                      aria-label="Edit deal"
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    )}
                    {!readOnly && DELETABLE_STATUSES.has(deal.status) && (
                      <button
                        onClick={() => handleDelete(deal)}
                        disabled={deletingIds.has(deal.id)}
                        aria-label="Delete deal"
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <DealStatusBadge status={deal.status} compact />
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
                  {deal.notes && (
                    <button
                      type="button"
                      onClick={() => setInfoModal({ type: "notes", deal })}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-2.5 text-xs font-medium text-amber-700 dark:text-amber-400"
                    >
                      <StickyNote className="h-3.5 w-3.5" />
                      Notes
                    </button>
                  )}
                  {deal.serviceCategory && (
                    <button
                      type="button"
                      onClick={() => setInfoModal({ type: "services", deal })}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/5 px-2.5 text-xs font-medium text-violet-700 dark:text-violet-400"
                    >
                      <Briefcase className="h-3.5 w-3.5" />
                      Services
                    </button>
                  )}
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
      <EditDealModal deal={editDeal} onClose={() => setEditDeal(null)} onSaved={handleSaved} />
    )}
    </>
  );
}
