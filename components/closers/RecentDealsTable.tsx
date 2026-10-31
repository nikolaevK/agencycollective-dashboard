"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { format } from "date-fns";
import Link from "next/link";
import { FileText, MoreHorizontal, Pencil, Trash2, Link2, CalendarDays, StickyNote, Briefcase, UserRound, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useToast } from "@/components/providers/ToastProvider";
import { Badge, BadgeDot, badgeToneHover, badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dialogOverlayClass, dialogPanelClass } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConfirm } from "@/components/ui/use-confirm";
import { DealStatusBadge } from "@/components/closers/DealStatusBadge";
import { formatCents } from "@/components/closers/types";
import type { DealPublic } from "@/components/closers/types";
import type { DealStatus } from "@/lib/deals";
import { useQueryClient } from "@tanstack/react-query";
import { UnifiedDealForm } from "@/components/shared/UnifiedDealForm";
import { DealInfoModal } from "@/components/shared/DealInfoModal";
import { DealInvoiceStatusBadge } from "@/components/closers/DealInvoiceStatusBadge";
import { DealContractStatusBadge } from "@/components/closers/DealContractStatusBadge";
import { DealAgentPrepBadge, type DealAgentPrepBadgeData } from "@/components/closers/DealAgentPrepBadge";
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
  /** Set when the payout Sales Rep moved the deal off its submitter. */
  originalCloserName?: string | null;
  /** Deal-prep agent state (admin queue only; null once the invoice is sent). */
  agentPrep?: DealAgentPrepBadgeData | null;
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
        badgeVariants({ variant: "outline", tone: isPaid ? "success" : "danger" }),
        "h-7 gap-1.5 px-2.5 font-medium disabled:opacity-60 sm:h-5 sm:px-2",
        adminMode && cn("cursor-pointer disabled:cursor-wait", badgeToneHover[isPaid ? "success" : "danger"])
      )}
      title={adminMode ? (toggling ? "Updating…" : isPaid ? "Mark as unpaid" : "Mark as paid") : undefined}
    >
      {toggling ? (
        <Loader2 className="animate-spin opacity-70" />
      ) : (
        <BadgeDot tone={isPaid ? "success" : "danger"} />
      )}
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

/* ── Row actions menu ── */
function DealActionsCell({
  deal,
  onEdit,
  onDelete,
}: {
  deal: DealPublic;
  onEdit: (d: DealPublic) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Deal actions" className="text-muted-foreground">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40 min-w-40">
        <DropdownMenuItem onSelect={() => onEdit(deal)}>
          <Pencil className="text-muted-foreground" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={() => onDelete(deal.id)}>
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
  const { confirm, dialog } = useConfirm();

  // Backdrop / × / Escape are easy to hit by accident — confirm before
  // throwing edits away, and never close mid-save (the result would be lost).
  async function requestClose() {
    if (saving) return;
    if (dirty && !(await confirm({ title: "Discard unsaved changes?", destructive: true, confirmText: "Discard" }))) return;
    onClose();
  }

  // Stays registered while saving (requestClose no-ops) so Escape is absorbed
  // here instead of falling through to a layer underneath.
  useEscapeKey(requestClose);

  // Portaled to <body> (z-50, like the overlay) so the form's Select / date
  // popovers and the discard prompt — all z-50 portals — layer above it.
  return createPortal(
    <>
      <div className={dialogOverlayClass} onClick={requestClose} />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
        <div className={cn(dialogPanelClass, "pointer-events-auto relative w-full max-w-lg mx-4 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain")}>
          <div className="sticky top-0 z-10 flex items-center justify-between px-4 sm:px-6 py-4 border-b bg-popover">
            <h3 className="text-base font-semibold tracking-tight">Edit Deal</h3>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={requestClose}
              disabled={saving}
              aria-label="Close"
              className="-mr-2"
            >
              <X />
            </Button>
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
      {dialog}
    </>,
    document.body
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
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
        {recentDeals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="size-5 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No deals yet</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Client Name</TableHead>
                    <TableHead>Deal Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    {adminMode && (
                      <TableHead className="text-right">Actions</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentDeals.map((deal) => (
                    <TableRow key={deal.id}>
                      <TableCell className="whitespace-normal">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">
                              {deal.clientUserId ? (
                                <Link href={`/dashboard/users/${deal.clientUserId}`} className="underline-offset-4 hover:underline">
                                  {deal.clientName}
                                </Link>
                              ) : (
                                deal.clientName
                              )}
                            </span>
                            {deal.clientUserId && <Link2 className="size-3 text-muted-foreground shrink-0" />}
                            {deal.createdByAdminId && <AdminEnteredBadge />}
                            {deal.originalCloserName && <ReassignedBadge from={deal.originalCloserName} />}
                            {deal.googleEventId && <CalendarDays className="size-3 text-muted-foreground shrink-0" />}
                            {deal.closerName && (
                              <span className="relative shrink-0 text-muted-foreground group/closer">
                                <UserRound className="size-3.5" />
                                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-3 py-1.5 rounded-xl bg-foreground text-background text-xs whitespace-nowrap opacity-0 pointer-events-none group-hover/closer:opacity-100 transition-opacity z-50">
                                  {deal.closerName}
                                </span>
                              </span>
                            )}
                            {deal.notes && (
                              <Button variant="ghost" size="icon-xs" onClick={() => setInfoModal({ type: "notes", deal })} className="text-muted-foreground" title="View notes">
                                <StickyNote className="size-3.5" />
                              </Button>
                            )}
                            {deal.serviceCategory && (
                              <Button variant="ghost" size="icon-xs" onClick={() => setInfoModal({ type: "services", deal })} className="text-muted-foreground" title="View services">
                                <Briefcase className="size-3.5" />
                              </Button>
                            )}
                          </div>
                          {(deal.brandName || deal.website) && (
                            <div className="flex items-center gap-2 mt-0.5">
                              {deal.brandName && <span className="text-xs text-muted-foreground">{deal.brandName}</span>}
                              {deal.website && (
                                <a href={deal.website.startsWith("http") ? deal.website : `https://${deal.website}`} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline truncate max-w-[180px]">
                                  {deal.website.replace(/^https?:\/\//, "")}
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold tabular-nums">{formatCents(deal.dealValue)}</span>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <DealStatusBadge status={deal.status} />
                          {deal.invoiceStatus && (
                            <DealInvoiceStatusBadge
                              status={deal.invoiceStatus}
                              onClick={adminMode ? () => setInvoiceSnap(deal) : undefined}
                              isAdmin={adminMode}
                            />
                          )}
                          {adminMode && deal.status === "closed" && (
                            <DealAgentPrepBadge prep={deal.agentPrep} onClick={() => setInvoiceSnap(deal)} />
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
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDealDate(deal.closingDate || deal.createdAt)}
                      </TableCell>
                      {adminMode && (
                        <TableCell className="text-right">
                          <DealActionsCell
                            deal={deal}
                            onEdit={setEditDeal}
                            onDelete={openDeleteConfirm}
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile card list */}
            <div className="md:hidden space-y-3">
              {recentDeals.map((deal) => (
                <div key={deal.id} className="rounded-2xl border p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <div>
                        <div className="flex items-center gap-1.5">
                          {deal.clientUserId ? (
                            <Link href={`/dashboard/users/${deal.clientUserId}`} className="min-w-0 truncate font-medium text-sm">
                              {deal.clientName}
                            </Link>
                          ) : (
                            <span className="min-w-0 truncate font-medium text-sm">{deal.clientName}</span>
                          )}
                          {deal.clientUserId && <Link2 className="size-3 text-muted-foreground shrink-0" />}
                          {deal.createdByAdminId && <AdminEnteredBadge />}
                          {deal.originalCloserName && <ReassignedBadge from={deal.originalCloserName} />}
                        </div>
                        {(deal.brandName || deal.website) && (
                          <div className="flex items-center gap-2 mt-0.5 min-w-0">
                            {deal.brandName && <span className="min-w-0 truncate text-xs text-muted-foreground">{deal.brandName}</span>}
                            {deal.website && (
                              <a href={deal.website.startsWith("http") ? deal.website : `https://${deal.website}`} target="_blank" rel="noopener noreferrer" className="min-w-0 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline truncate max-w-[150px]">
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
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setInfoModal({ type: "notes", deal })}
                            >
                              <StickyNote className="size-3.5 text-muted-foreground" />
                              Notes
                            </Button>
                          )}
                          {deal.serviceCategory && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setInfoModal({ type: "services", deal })}
                            >
                              <Briefcase className="size-3.5 text-muted-foreground" />
                              Services
                            </Button>
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
                    <span className="font-semibold tabular-nums text-sm">{formatCents(deal.dealValue)}</span>
                    <div className="flex min-w-0 items-center justify-end gap-1.5 flex-wrap">
                      <DealStatusBadge status={deal.status} />
                      {deal.invoiceStatus && (
                        <DealInvoiceStatusBadge
                          status={deal.invoiceStatus}
                          onClick={adminMode ? () => setInvoiceSnap(deal) : undefined}
                          isAdmin={adminMode}
                        />
                      )}
                      {adminMode && deal.status === "closed" && (
                        <DealAgentPrepBadge prep={deal.agentPrep} onClick={() => setInvoiceSnap(deal)} />
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
        </CardContent>
      </Card>

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

      {/* Confirm delete dialog (portaled, z-50 — see EditDealModal) */}
      {confirmDeleteId && createPortal(
        <>
          <div className={dialogOverlayClass} onClick={closeDeleteConfirm} />
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
            <div role="alertdialog" aria-modal="true" aria-labelledby="delete-deal-title" className={cn(dialogPanelClass, "pointer-events-auto relative w-full max-w-sm mx-4 p-6")}>
              <h3 id="delete-deal-title" className="text-base font-medium mb-2">
                {confirmDeleteDeal ? `Delete deal for ${confirmDeleteDeal.clientName}?` : "Delete deal?"}
              </h3>
              <p className="text-sm text-muted-foreground mb-6">This action cannot be undone.</p>
              {deleteError && (
                <div className="mb-4 rounded-2xl bg-destructive/10 px-4 py-3">
                  <p className="text-sm text-destructive">{deleteError}</p>
                </div>
              )}
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={closeDeleteConfirm} disabled={deleting}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={() => handleDelete(confirmDeleteId)} disabled={deleting}>
                  {deleting ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}

/** Deal moved off its submitter by the payout Sales Rep (lib/dealCloserReassign.ts). */
function ReassignedBadge({ from }: { from: string }) {
  return (
    <Badge
      variant="secondary"
      title={`Submitted by ${from} — moved to the closer named in the payout's Sales Rep`}
    >
      Reassigned
    </Badge>
  );
}

/** Deal entered by an admin from the Deal queue (POST /api/admin/deals). */
function AdminEnteredBadge() {
  return (
    <Badge
      variant="secondary"
      title="Entered by an admin from the Deal queue"
    >
      Admin
    </Badge>
  );
}
