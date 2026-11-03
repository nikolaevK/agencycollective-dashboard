"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { DealStatusBadge } from "@/components/closers/DealStatusBadge";
import { Link2, Pencil, StickyNote, Briefcase, Search, Trash2, X } from "lucide-react";
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
import { useToast } from "@/components/providers/ToastProvider";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dialogOverlayClass, dialogPanelClass } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Toggle } from "@/components/ui/toggle";
import { TOUCH_TARGET } from "@/components/ui/touch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useConfirm } from "@/components/ui/use-confirm";

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

function PaidBadge({ paidStatus }: { paidStatus: string }) {
  return (
    <StatusBadge tone={paidStatus === "paid" ? "success" : "danger"}>
      {paidStatus === "paid" ? "Paid" : "Unpaid"}
    </StatusBadge>
  );
}

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

  return (
    // z-50 (not above it) so the portaled discard confirm + any Radix
    // popovers inside the form stack on top of this modal.
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className={dialogOverlayClass} onClick={requestClose} />
      <div className={cn(dialogPanelClass, "relative z-50 w-full max-w-lg mx-4 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain")}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 sm:px-6 py-4 border-b bg-popover">
          <h3 className="text-base font-medium">Edit Deal</h3>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={requestClose}
            disabled={saving}
            className="-mr-2"
          >
            <span className="sr-only">Close</span>
            <X />
          </Button>
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
      {dialog}
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
  const { toastError } = useToast();
  const { confirm, dialog } = useConfirm();

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
    if (
      !(await confirm({
        title: `Delete the deal for ${deal.clientName}?`,
        description: "This cannot be undone.",
        destructive: true,
        confirmText: "Delete",
      }))
    )
      return;
    setDeletingIds((prev) => new Set(prev).add(deal.id));
    try {
      const res = await fetch(`/api/closer/deals?id=${encodeURIComponent(deal.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toastError(json.error ?? "Failed to delete deal.");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["closer-stats"] });
      queryClient.invalidateQueries({ queryKey: ["closer-deals"] });
    } catch {
      // Network failure / abort. Without this catch the rejection escapes,
      // the button quietly re-enables, and the user sees no feedback at all.
      toastError("Couldn't reach the server. Check your connection and try again.");
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
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Deals</CardTitle>
          <span className="text-xs text-muted-foreground tabular-nums">
            {showingCount === totalCount ? `${totalCount}` : `${showingCount} of ${totalCount}`}
          </span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={range}
            // Radix reports "" when the active item is clicked again; a range
            // can't be deselected, so ignore that.
            onValueChange={(v) => {
              if (v) setRange(v as RangeFilter);
            }}
            aria-label="Date range"
            className="justify-start"
          >
            {(["all", "week", "month"] as const).map((key) => (
              <ToggleGroupItem key={key} value={key} className="px-3">
                {key === "all" ? "All" : key === "week" ? "This Week" : "This Month"}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by client or brand"
              className="pl-9"
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Status filters">
          {STATUS_FILTERS.map((opt) => {
            const active = statusFilters.has(opt.value);
            return (
              <Toggle
                key={opt.value}
                variant="outline"
                size="sm"
                pressed={active}
                onPressedChange={() => toggleStatusFilter(opt.value)}
                className="h-7 min-w-0 px-2.5 text-xs"
              >
                {opt.label}
              </Toggle>
            );
          })}
          {statusFilters.size > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setStatusFilters(new Set())}
              className="text-muted-foreground"
            >
              Clear
            </Button>
          )}
        </div>
      </CardHeader>

      {filtered.length === 0 ? (
        <CardContent className="p-8 md:p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {totalCount === 0 ? "No deals yet. Create your first deal!" : "No deals match your filters."}
          </p>
        </CardContent>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block max-h-[60dvh] overflow-auto">
            <Table className="[&_td]:px-5 [&_th]:px-5">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Client</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((deal) => (
                  <TableRow key={deal.id}>
                    <TableCell className="font-medium whitespace-normal">
                      <div>
                        <span className="inline-flex items-center gap-1.5">
                          {deal.clientName}
                          {deal.clientUserId && <Link2 className="size-3 text-muted-foreground shrink-0" />}
                          {deal.notes && (
                            <Button variant="ghost" size="icon-xs" onClick={() => setInfoModal({ type: "notes", deal })} className="text-muted-foreground" title="View notes">
                              <StickyNote />
                            </Button>
                          )}
                          {deal.serviceCategory && (
                            <Button variant="ghost" size="icon-xs" onClick={() => setInfoModal({ type: "services", deal })} className="text-muted-foreground" title="View services">
                              <Briefcase />
                            </Button>
                          )}
                        </span>
                        {(deal.brandName || deal.website) && (
                          <div className="flex items-center gap-2 mt-0.5">
                            {deal.brandName && <span className="text-xs text-muted-foreground font-normal">{deal.brandName}</span>}
                            {deal.website && (
                              <a href={deal.website.startsWith("http") ? deal.website : `https://${deal.website}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline-offset-4 hover:underline truncate max-w-[180px] font-normal">
                                {deal.website.replace(/^https?:\/\//, "")}
                              </a>
                            )}
                          </div>
                        )}
                        {deal.setterName && (
                          <div className="text-xs text-muted-foreground font-normal mt-0.5">
                            Set by {deal.setterName}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold tabular-nums">{formatCents(deal.dealValue)}</TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <DealStatusBadge status={deal.status} compact />
                        {deal.invoiceStatus && (
                          <DealInvoiceStatusBadge status={deal.invoiceStatus} />
                        )}
                        {deal.contractStatus && (
                          <DealContractStatusBadge status={deal.contractStatus} />
                        )}
                        <PaidBadge paidStatus={deal.paidStatus} />
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(deal.closingDate || deal.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-0.5">
                        {!readOnly && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setEditDeal(deal)}
                          aria-label="Edit deal"
                          className="text-muted-foreground"
                        >
                          <Pencil />
                        </Button>
                        )}
                        {!readOnly && DELETABLE_STATUSES.has(deal.status) && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleDelete(deal)}
                            disabled={deletingIds.has(deal.id)}
                            aria-label="Delete deal"
                            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards — stacked rows: the badge/amount/actions cluster
              used to sit beside the name as one non-shrinking row, which
              squeezed the client name to nothing and overflowed the card. */}
          <div className="md:hidden max-h-[60dvh] overflow-y-auto overscroll-contain divide-y border-t">
            {filtered.map((deal) => (
              <div key={deal.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{deal.clientName}</p>
                    {(deal.brandName || deal.website) && (
                      <div className="flex items-center gap-2 mt-0.5 min-w-0">
                        {deal.brandName && <span className="min-w-0 truncate text-xs text-muted-foreground">{deal.brandName}</span>}
                        {deal.website && (
                          // Touch screens: a 32px target over the plain text lines
                          // around it. Truncation lives on the inner span — an
                          // overflow-hidden link would clip that touch area.
                          <a href={deal.website.startsWith("http") ? deal.website : `https://${deal.website}`} target="_blank" rel="noopener noreferrer" className={cn("min-w-0 max-w-[150px] text-xs text-primary underline-offset-4 hover:underline", TOUCH_TARGET, "[@media(pointer:coarse)]:after:-inset-x-1 [@media(pointer:coarse)]:after:-inset-y-2")}>
                            <span className="block truncate">{deal.website.replace(/^https?:\/\//, "")}</span>
                          </a>
                        )}
                      </div>
                    )}
                    {deal.setterName && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        Set by {deal.setterName}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(deal.closingDate || deal.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="mr-1 text-sm font-semibold tabular-nums">
                      {formatCents(deal.dealValue)}
                    </span>
                    {!readOnly && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditDeal(deal)}
                      aria-label="Edit deal"
                      className="text-muted-foreground"
                    >
                      <Pencil />
                    </Button>
                    )}
                    {!readOnly && DELETABLE_STATUSES.has(deal.status) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(deal)}
                        disabled={deletingIds.has(deal.id)}
                        aria-label="Delete deal"
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 />
                      </Button>
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
                  <PaidBadge paidStatus={deal.paidStatus} />
                  {deal.notes && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setInfoModal({ type: "notes", deal })}
                    >
                      <StickyNote />
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
                      <Briefcase />
                      Services
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>

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

    {dialog}
    </>
  );
}
