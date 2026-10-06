"use client";

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { format } from "date-fns";
import Link from "next/link";
import { FileText, MoreHorizontal, Pencil, Trash2, Link2, CalendarDays, StickyNote, Briefcase, UserRound, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useToast } from "@/components/providers/ToastProvider";
import { DealStatusBadge } from "@/components/closers/DealStatusBadge";
import { formatCents } from "@/components/closers/types";
import type { DealPublic } from "@/components/closers/types";
import type { DealStatus } from "@/lib/deals";
import { useQueryClient } from "@tanstack/react-query";
import { UnifiedDealForm } from "@/components/shared/UnifiedDealForm";
import { DealInfoModal } from "@/components/shared/DealInfoModal";
import { DealInvoiceStatusBadge } from "@/components/closers/DealInvoiceStatusBadge";
import { DealContractStatusBadge } from "@/components/closers/DealContractStatusBadge";
// Lazy-loaded: the review drawers only mount when an admin opens a specific
// deal, and DealInvoiceDrawer pulls in @react-pdf/renderer — keeping them out
// of the initial bundle for every page that renders this table.
const DealInvoiceDrawer = dynamic(
  () =>
    import("@/components/closers/DealInvoiceDrawer").then(
      (m) => m.DealInvoiceDrawer
    ),
  { ssr: false }
);
const DealContractDrawer = dynamic(
  () =>
    import("@/components/closers/DealContractDrawer").then(
      (m) => m.DealContractDrawer
    ),
  { ssr: false }
);

interface DealWithInvoice extends DealPublic {
  invoiceStatus?: string | null;
  invoiceNumber?: string | null;
  contractStatus?: string | null;
  closerName?: string | null;
}

interface RecentDealsTableProps {
  deals: DealWithInvoice[];
  adminMode?: boolean;
  closerId?: string;
  title?: string;
}


function PaidStatusBadge({ deal, adminMode }: { deal: DealWithInvoice; adminMode: boolean }) {
  const queryClient = useQueryClient();
  const { toastError } = useToast();
  const [toggling, setToggling] = useState(false);
  const isPaid = deal.paidStatus === "paid";

  const toggle = async () => {
    // Locked while in flight — a double click used to flip it twice.
    if (!adminMode || toggling) return;
    setToggling(true);
    try {
      const res = await fetch("/api/admin/deals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deal.id, paidStatus: isPaid ? "unpaid" : "paid" }),
      });
      if (res.ok) {
        // Awaited so the badge stays locked until the refetched row lands.
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["admin-deals"] }),
          queryClient.invalidateQueries({ queryKey: ["admin-deal-queue-metrics"] }),
          queryClient.invalidateQueries({ queryKey: ["admin-all-deals"] }),
          queryClient.invalidateQueries({ queryKey: ["closer-deals"] }),
          queryClient.invalidateQueries({ queryKey: ["closer-detail"] }),
          queryClient.invalidateQueries({ queryKey: ["closers-stats"] }),
        ]);
      } else {
        const json = await res.json().catch(() => ({}));
        toastError(json.error ?? `Couldn't mark ${deal.clientName} as ${isPaid ? "unpaid" : "paid"}. Try again.`);
      }
    } catch {
      toastError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setToggling(false);
    }
  };

  return (
    <button
      type="button"
      onClick={adminMode ? toggle : undefined}
      disabled={toggling}
      className={cn(
        "inline-flex items-center gap-1 shrink-0 px-2.5 py-1.5 sm:px-2 sm:py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide whitespace-nowrap transition-colors disabled:opacity-60",
        isPaid
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
          : "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
        adminMode && "cursor-pointer hover:opacity-80 disabled:cursor-wait"
      )}
      title={adminMode ? (toggling ? "Updating…" : isPaid ? "Mark as unpaid" : "Mark as paid") : undefined}
    >
      {toggling && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
      {isPaid ? "Paid" : "Unpaid"}
    </button>
  );
}

function formatDealDate(dateStr: string | null): string {
  if (!dateStr) return "---";
  try {
    // Parse YYYY-MM-DD as local date (not UTC) to avoid timezone shift
    const parts = dateStr.slice(0, 10).split("-");
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return format(d, "MMM d, yyyy");
    }
    return format(new Date(dateStr), "MMM d, yyyy");
  } catch {
    return "---";
  }
}

const INPUT_CLS =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 transition-shadow";

/* ── Portal-based actions dropdown ── */
function DealActionsDropdown({
  deal,
  onEdit,
  onDelete,
  onClose,
  anchorRef,
}: {
  deal: DealPublic;
  onEdit: (d: DealPublic) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement>;
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  // Layout effect so the menu is placed before first paint. Opens upward
  // when there isn't room below the trigger (last rows of a long table).
  useLayoutEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? 0;
    const fitsBelow = rect.bottom + 4 + menuHeight <= window.innerHeight - 8;
    setPos({
      top: fitsBelow ? rect.bottom + 4 : Math.max(8, rect.top - 4 - menuHeight),
      left: rect.right - 160,
    });
  }, [anchorRef]);

  // Position is computed once, so close instead of drifting away from the
  // trigger on scroll (any scroll container — capture phase) or resize.
  useEffect(() => {
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  useEscapeKey(onClose);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div
        ref={menuRef}
        className="fixed z-[61] w-40 rounded-lg border border-border bg-popover shadow-lg py-1 animate-in fade-in-0 zoom-in-95 duration-100"
        style={{ top: pos.top, left: Math.max(8, Math.min(pos.left, window.innerWidth - 168)) }}
      >
        <button
          onClick={() => { onClose(); onEdit(deal); }}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
        >
          <Pencil className="h-4 w-4 text-muted-foreground" />
          Edit
        </button>
        <button
          onClick={() => { onClose(); onDelete(deal.id); }}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </button>
      </div>
    </>,
    document.body
  );
}

function DealActionsCell({
  deal,
  onEdit,
  onDelete,
}: {
  deal: DealPublic;
  onEdit: (d: DealPublic) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        aria-label="Deal actions"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <DealActionsDropdown
          deal={deal}
          onEdit={onEdit}
          onDelete={onDelete}
          onClose={() => setOpen(false)}
          anchorRef={btnRef}
        />
      )}
    </>
  );
}

/* ── Edit Deal Modal ── */
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
            aria-label="Close"
            className="-mr-2 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <span aria-hidden>&times;</span>
          </button>
        </div>
        <div className="p-4 sm:p-6">
          <UnifiedDealForm
            key={deal.id}
            mode="edit"
            context="admin"
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

/* ── Main component ── */
export function RecentDealsTable({ deals, adminMode = true, closerId, title = "Recent Closings" }: RecentDealsTableProps) {
  const [editDeal, setEditDeal] = useState<DealPublic | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [infoModal, setInfoModal] = useState<{ type: "notes" | "services"; deal: DealPublic } | null>(null);
  // Snapshot the deal when a drawer opens: a send can move it out of a
  // status-filtered list (closed → pending_signature), and the drawer must
  // keep its value / client email rather than fall back to blanks.
  const [invoiceSnap, setInvoiceSnap] = useState<DealWithInvoice | null>(null);
  const [contractSnap, setContractSnap] = useState<DealWithInvoice | null>(null);
  const invoiceDeal = invoiceSnap && (deals.find((d) => d.id === invoiceSnap.id) ?? invoiceSnap);
  const contractDeal = contractSnap && (deals.find((d) => d.id === contractSnap.id) ?? contractSnap);
  const confirmDeleteDeal = deals.find((d) => d.id === confirmDeleteId);
  // Plain state rather than useTransition: on React 18 an async transition's
  // isPending clears at the first await, so "Deleting..." never stayed up.
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const recentDeals = [...deals]
    .sort(
      (a, b) =>
        new Date(b.closingDate || b.createdAt).getTime() -
        new Date(a.closingDate || a.createdAt).getTime()
    );

  function openDeleteConfirm(id: string) {
    setDeleteError(null);
    setConfirmDeleteId(id);
  }

  function closeDeleteConfirm() {
    if (deleting) return;
    setConfirmDeleteId(null);
  }

  // Registered for as long as the dialog is open (closeDeleteConfirm no-ops
  // mid-delete), so Escape never falls through to a layer underneath.
  useEscapeKey(closeDeleteConfirm, !!confirmDeleteId);

  async function handleDelete(id: string) {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/admin/deals?id=${id}`, { method: "DELETE" });
      // 404 = already deleted (another tab/admin) — same end state, so close
      // and refresh instead of leaving a dead row behind an error.
      if (!res.ok && res.status !== 404) {
        // Keep the dialog open so the failure is visible next to the action.
        const json = await res.json().catch(() => ({}));
        setDeleteError(json.error || "Failed to delete deal. Try again.");
        return;
      }
      setConfirmDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ["closer-detail"] });
      queryClient.invalidateQueries({ queryKey: ["closers-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-all-deals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-deals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-deal-queue-metrics"] });
    } catch {
      setDeleteError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setDeleting(false);
    }
  }

  function handleSaved() {
    setEditDeal(null);
    queryClient.invalidateQueries({ queryKey: ["closer-detail"] });
    queryClient.invalidateQueries({ queryKey: ["closers-stats"] });
    queryClient.invalidateQueries({ queryKey: ["admin-all-deals"] });
  }

  return (
    <>
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4 sm:mb-6">
          {title}
        </h3>

        {recentDeals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center mb-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No deals yet</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 dark:border-white/[0.06]">
                    <th className="text-left text-xs font-medium text-muted-foreground pb-3 pr-4">Client Name</th>
                    <th className="text-left text-xs font-medium text-muted-foreground pb-3 pr-4">Deal Amount</th>
                    <th className="text-left text-xs font-medium text-muted-foreground pb-3 pr-4">Status</th>
                    <th className="text-left text-xs font-medium text-muted-foreground pb-3 pr-4">Date</th>
                    {adminMode && (
                      <th className="text-right text-xs font-medium text-muted-foreground pb-3">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {recentDeals.map((deal) => (
                    <tr key={deal.id} className="border-b border-border/50 dark:border-white/[0.06] last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="py-3 pr-4">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-foreground">
                              {deal.clientUserId ? (
                                <Link href={`/dashboard/users/${deal.clientUserId}`} className="hover:text-primary transition-colors">
                                  {deal.clientName}
                                </Link>
                              ) : (
                                deal.clientName
                              )}
                            </span>
                            {deal.clientUserId && <Link2 className="h-3 w-3 text-primary shrink-0" />}
                            {deal.createdByAdminId && <AdminEnteredBadge />}
                            {deal.googleEventId && <CalendarDays className="h-3 w-3 text-muted-foreground shrink-0" />}
                            {deal.closerName && (
                              <span className="relative shrink-0 text-muted-foreground group/closer">
                                <UserRound className="h-3.5 w-3.5" />
                                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded-md bg-foreground text-background text-[10px] font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover/closer:opacity-100 transition-opacity z-50">
                                  {deal.closerName}
                                </span>
                              </span>
                            )}
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
                          </div>
                          {(deal.brandName || deal.website) && (
                            <div className="flex items-center gap-2 mt-0.5">
                              {deal.brandName && <span className="text-xs text-muted-foreground">{deal.brandName}</span>}
                              {deal.website && (
                                <a href={deal.website.startsWith("http") ? deal.website : `https://${deal.website}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate max-w-[180px]">
                                  {deal.website.replace(/^https?:\/\//, "")}
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="font-semibold text-foreground">{formatCents(deal.dealValue)}</span>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <DealStatusBadge status={deal.status} />
                          {deal.invoiceStatus && (
                            <DealInvoiceStatusBadge
                              status={deal.invoiceStatus}
                              onClick={adminMode ? () => setInvoiceSnap(deal) : undefined}
                              isAdmin={adminMode}
                            />
                          )}
                          {deal.contractStatus && (
                            // Intentional: a pending contract has no DocuSeal
                            // submission yet — it's picked and sent together
                            // with the invoice, so it opens the invoice drawer.
                            <span
                              className="inline-flex"
                              title={adminMode && deal.contractStatus === "pending" ? "Pending contracts are sent with the invoice" : undefined}
                            >
                              <DealContractStatusBadge
                                status={deal.contractStatus}
                                onClick={adminMode ? () => {
                                  if (deal.contractStatus === "pending") {
                                    setInvoiceSnap(deal);
                                  } else {
                                    setContractSnap(deal);
                                  }
                                } : undefined}
                              />
                            </span>
                          )}
                          <PaidStatusBadge deal={deal} adminMode={adminMode} />
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {formatDealDate(deal.closingDate || deal.createdAt)}
                      </td>
                      {adminMode && (
                        <td className="py-3 text-right">
                          <DealActionsCell
                            deal={deal}
                            onEdit={setEditDeal}
                            onDelete={openDeleteConfirm}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="md:hidden space-y-3">
              {recentDeals.map((deal) => (
                <div key={deal.id} className="rounded-lg border border-border/50 dark:border-white/[0.06] bg-background/50 p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <div>
                        <div className="flex items-center gap-1.5">
                          {deal.clientUserId ? (
                            <Link href={`/dashboard/users/${deal.clientUserId}`} className="min-w-0 truncate font-medium text-foreground text-sm">
                              {deal.clientName}
                            </Link>
                          ) : (
                            <span className="min-w-0 truncate font-medium text-foreground text-sm">{deal.clientName}</span>
                          )}
                          {deal.clientUserId && <Link2 className="h-3 w-3 text-primary shrink-0" />}
                          {deal.createdByAdminId && <AdminEnteredBadge />}
                        </div>
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
                      </div>
                      {/* Touch has no hover: the closer name is shown inline
                          here instead of the desktop hover tooltip. */}
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {formatDealDate(deal.closingDate || deal.createdAt)}
                        {deal.closerName && <> · {deal.closerName}</>}
                      </p>
                      {(deal.notes || deal.serviceCategory) && (
                        <div className="mt-2 flex flex-wrap gap-2">
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
                      )}
                    </div>
                    {adminMode && (
                      <DealActionsCell
                        deal={deal}
                        onEdit={setEditDeal}
                        onDelete={openDeleteConfirm}
                      />
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-foreground text-sm">{formatCents(deal.dealValue)}</span>
                    <div className="flex min-w-0 items-center justify-end gap-1.5 flex-wrap">
                      <DealStatusBadge status={deal.status} />
                      {deal.invoiceStatus && (
                        <DealInvoiceStatusBadge
                          status={deal.invoiceStatus}
                          onClick={adminMode ? () => setInvoiceSnap(deal) : undefined}
                          isAdmin={adminMode}
                        />
                      )}
                      {deal.contractStatus && (
                        <span
                          className="inline-flex"
                          title={adminMode && deal.contractStatus === "pending" ? "Pending contracts are sent with the invoice" : undefined}
                        >
                          <DealContractStatusBadge
                            status={deal.contractStatus}
                            onClick={adminMode ? () => {
                              if (deal.contractStatus === "pending") {
                                setInvoiceSnap(deal);
                              } else {
                                setContractSnap(deal);
                              }
                            } : undefined}
                          />
                        </span>
                      )}
                      <PaidStatusBadge deal={deal} adminMode={adminMode} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Edit modal */}
      {editDeal && (
        <EditDealModal deal={editDeal} onClose={() => setEditDeal(null)} onSaved={handleSaved} />
      )}

      {/* Info modal (notes / services) */}
      {infoModal && (
        <DealInfoModal
          title={infoModal.type === "notes" ? `Notes — ${infoModal.deal.clientName}` : `Services — ${infoModal.deal.clientName}`}
          type={infoModal.type}
          content={infoModal.type === "notes" ? infoModal.deal.notes : infoModal.deal.serviceCategory}
          onClose={() => setInfoModal(null)}
        />
      )}

      {/* Invoice review drawer */}
      {adminMode && invoiceDeal && (
        <DealInvoiceDrawer
          dealId={invoiceDeal.id}
          dealValue={invoiceDeal.dealValue}
          dealPaymentType={invoiceDeal.paymentType}
          dealNotes={invoiceDeal.notes}
          onClose={() => setInvoiceSnap(null)}
        />
      )}

      {/* Contract review drawer */}
      {adminMode && contractDeal && (
        <DealContractDrawer
          dealId={contractDeal.id}
          clientEmail={contractDeal.clientEmail}
          onClose={() => setContractSnap(null)}
          isAdmin
        />
      )}

      {/* Confirm delete dialog */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeDeleteConfirm} />
          <div role="alertdialog" aria-modal="true" aria-labelledby="delete-deal-title" className="relative w-full max-w-sm mx-4 rounded-2xl border border-border bg-card shadow-2xl p-6">
            <h3 id="delete-deal-title" className="text-lg font-semibold text-foreground mb-2">
              {confirmDeleteDeal ? `Delete deal for ${confirmDeleteDeal.clientName}?` : "Delete deal?"}
            </h3>
            <p className="text-sm text-muted-foreground mb-6">This action cannot be undone.</p>
            {deleteError && (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5">
                <p className="text-sm text-destructive">{deleteError}</p>
              </div>
            )}
            <div className="flex items-center justify-end gap-3">
              <button onClick={closeDeleteConfirm} disabled={deleting} className="h-9 rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={() => handleDelete(confirmDeleteId)} disabled={deleting} className="h-9 rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50">
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Deal entered by an admin from the Deal queue (POST /api/admin/deals). */
function AdminEnteredBadge() {
  return (
    <span
      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"
      title="Entered by an admin from the Deal queue"
    >
      Admin
    </span>
  );
}
