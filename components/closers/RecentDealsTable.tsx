"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import Link from "next/link";
import { FileText, MoreHorizontal, Pencil, Trash2, Link2, CalendarDays, StickyNote, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCents } from "@/components/closers/types";
import type { DealPublic } from "@/components/closers/types";
import type { DealStatus } from "@/lib/deals";
import { useQueryClient } from "@tanstack/react-query";
import { UnifiedDealForm } from "@/components/shared/UnifiedDealForm";
import { DealInfoModal } from "@/components/shared/DealInfoModal";
import { DealInvoiceStatusBadge } from "@/components/closers/DealInvoiceStatusBadge";
import { DealInvoiceDrawer } from "@/components/closers/DealInvoiceDrawer";
import { DealContractStatusBadge } from "@/components/closers/DealContractStatusBadge";
import { DealContractDrawer } from "@/components/closers/DealContractDrawer";

interface DealWithInvoice extends DealPublic {
  invoiceStatus?: string | null;
  invoiceNumber?: string | null;
  contractStatus?: string | null;
}

interface RecentDealsTableProps {
  deals: DealWithInvoice[];
  adminMode?: boolean;
  closerId?: string;
}

const STATUS_BADGE_STYLES: Record<DealStatus, string> = {
  closed:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  not_closed:
    "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  pending_signature:
    "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  rescheduled:
    "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
  follow_up:
    "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
};

const STATUS_LABELS: Record<DealStatus, string> = {
  closed: "Closed",
  not_closed: "Not Closed",
  pending_signature: "Pending Signature",
  rescheduled: "Rescheduled",
  follow_up: "Follow Up",
};

function DealStatusBadge({ status }: { status: DealStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide whitespace-nowrap",
        STATUS_BADGE_STYLES[status] ?? STATUS_BADGE_STYLES.follow_up
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
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

  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.right - 160 });
  }, [anchorRef]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div
        className="fixed z-[61] w-40 rounded-lg border border-border bg-popover shadow-lg py-1 animate-in fade-in-0 zoom-in-95 duration-100"
        style={{ top: pos.top, left: Math.max(8, pos.left) }}
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
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-border bg-card shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">Edit Deal</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <span className="sr-only">Close</span>&times;
          </button>
        </div>
        <div className="p-6">
          <UnifiedDealForm
            mode="edit"
            context="admin"
            initialData={deal}
            onSuccess={onSaved}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Main component ── */
export function RecentDealsTable({ deals, adminMode = true, closerId }: RecentDealsTableProps) {
  const [editDeal, setEditDeal] = useState<DealPublic | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [infoModal, setInfoModal] = useState<{ type: "notes" | "services"; deal: DealPublic } | null>(null);
  const [invoiceDealId, setInvoiceDealId] = useState<string | null>(null);
  const [contractDealId, setContractDealId] = useState<string | null>(null);
  const invoiceDeal = deals.find((d) => d.id === invoiceDealId);
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();

  const recentDeals = [...deals]
    .sort(
      (a, b) =>
        new Date(b.closingDate || b.createdAt).getTime() -
        new Date(a.closingDate || a.createdAt).getTime()
    )
    .slice(0, 20);

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await fetch(`/api/admin/deals?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.error) {
        alert(json.error);
      }
      setConfirmDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ["closer-detail"] });
      queryClient.invalidateQueries({ queryKey: ["closers-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-all-deals"] });
    });
  }

  function handleSaved() {
    setEditDeal(null);
    queryClient.invalidateQueries({ queryKey: ["closer-detail"] });
    queryClient.invalidateQueries({ queryKey: ["closers-stats"] });
    queryClient.invalidateQueries({ queryKey: ["admin-all-deals"] });
  }

  return (
    <>
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-6">
        <h3 className="text-sm font-semibold text-foreground mb-6">
          Recent Closings
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
                          {deal.googleEventId && <CalendarDays className="h-3 w-3 text-muted-foreground shrink-0" />}
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
                              onClick={adminMode ? () => setInvoiceDealId(deal.id) : undefined}
                              isAdmin={adminMode}
                            />
                          )}
                          {deal.contractStatus && (
                            <DealContractStatusBadge
                              status={deal.contractStatus}
                              onClick={adminMode ? () => {
                                if (deal.contractStatus === "pending") {
                                  setInvoiceDealId(deal.id);
                                } else {
                                  setContractDealId(deal.id);
                                }
                              } : undefined}
                            />
                          )}
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
                            onDelete={setConfirmDeleteId}
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
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-foreground text-sm truncate">{deal.clientName}</span>
                        {deal.clientUserId && <Link2 className="h-3 w-3 text-primary shrink-0" />}
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
                      <span className="text-xs text-muted-foreground">{formatDealDate(deal.closingDate || deal.createdAt)}</span>
                    </div>
                    {adminMode && (
                      <DealActionsCell
                        deal={deal}
                        onEdit={setEditDeal}
                        onDelete={setConfirmDeleteId}
                      />
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground text-sm">{formatCents(deal.dealValue)}</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <DealStatusBadge status={deal.status} />
                      {deal.invoiceStatus && (
                        <DealInvoiceStatusBadge
                          status={deal.invoiceStatus}
                          onClick={adminMode ? () => setInvoiceDealId(deal.id) : undefined}
                          isAdmin={adminMode}
                        />
                      )}
                      {deal.contractStatus && (
                        <DealContractStatusBadge
                          status={deal.contractStatus}
                          onClick={adminMode ? () => {
                            if (deal.contractStatus === "pending") {
                              setInvoiceDealId(deal.id);
                            } else {
                              setContractDealId(deal.id);
                            }
                          } : undefined}
                        />
                      )}
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
      {adminMode && invoiceDealId && (
        <DealInvoiceDrawer
          dealId={invoiceDealId}
          dealValue={invoiceDeal?.dealValue ?? 0}
          dealPaymentType={invoiceDeal?.paymentType}
          onClose={() => setInvoiceDealId(null)}
        />
      )}

      {/* Contract review drawer */}
      {adminMode && contractDealId && (
        <DealContractDrawer
          dealId={contractDealId}
          clientEmail={deals.find((d) => d.id === contractDealId)?.clientEmail}
          onClose={() => setContractDealId(null)}
          isAdmin
        />
      )}

      {/* Confirm delete dialog */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmDeleteId(null)} />
          <div className="relative w-full max-w-sm mx-4 rounded-2xl border border-border bg-card shadow-2xl p-6">
            <h3 className="text-lg font-semibold text-foreground mb-2">Delete Deal</h3>
            <p className="text-sm text-muted-foreground mb-6">Are you sure you want to delete this deal? This action cannot be undone.</p>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setConfirmDeleteId(null)} className="h-9 rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors">
                Cancel
              </button>
              <button onClick={() => handleDelete(confirmDeleteId)} disabled={isPending} className="h-9 rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50">
                {isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
