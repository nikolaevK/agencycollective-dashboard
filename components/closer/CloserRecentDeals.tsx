"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Link2, Pencil, StickyNote, Briefcase } from "lucide-react";
import { formatCents } from "@/components/closers/types";
import type { DealPublic } from "@/components/closers/types";
import { useQueryClient } from "@tanstack/react-query";
import { UnifiedDealForm } from "@/components/shared/UnifiedDealForm";
import { DealInfoModal } from "@/components/shared/DealInfoModal";
import { DealInvoiceStatusBadge } from "@/components/closers/DealInvoiceStatusBadge";
import { DealContractStatusBadge } from "@/components/closers/DealContractStatusBadge";
import { format } from "date-fns";

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

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "\u2014";
  try {
    const parts = dateStr.slice(0, 10).split("-");
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return format(d, "MMM d, yyyy");
    }
    return format(new Date(dateStr), "MMM d, yyyy");
  } catch {
    return dateStr;
  }
}

interface DealWithInvoice extends DealPublic {
  invoiceStatus?: string | null;
  invoiceNumber?: string | null;
  contractStatus?: string | null;
}

interface Props {
  deals: DealWithInvoice[];
}

export function CloserRecentDeals({ deals }: Props) {
  const [editDeal, setEditDeal] = useState<DealPublic | null>(null);
  const [infoModal, setInfoModal] = useState<{ type: "notes" | "services"; deal: DealPublic } | null>(null);
  const queryClient = useQueryClient();
  const recent = deals.slice(0, 10);

  function handleSaved() {
    setEditDeal(null);
    queryClient.invalidateQueries({ queryKey: ["closer-stats"] });
    queryClient.invalidateQueries({ queryKey: ["closer-deals"] });
  }

  return (
    <>
    <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card">
      <div className="p-5 border-b border-border/50 dark:border-white/[0.06]">
        <h3 className="text-sm font-semibold text-foreground">Recent Closings</h3>
      </div>

      {recent.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm text-muted-foreground">No deals yet. Create your first deal!</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
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
                {recent.map((deal) => (
                  <tr
                    key={deal.id}
                    className="border-b border-border/50 dark:border-white/[0.06] last:border-0 hover:bg-muted/50 transition-colors"
                  >
                    <td className="px-5 py-3 font-medium text-foreground">
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
          <div className="md:hidden divide-y divide-border/50 dark:divide-white/[0.06]">
            {recent.map((deal) => (
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
