"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, Pencil, Trash2, StickyNote, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCents } from "@/components/closers/types";
import { SortHeader } from "@/components/ui/SortHeader";
import type { PayoutRecord, PayDistributed } from "@/lib/payouts";

// ---------------------------------------------------------------------------
// Inline toggle badge
// ---------------------------------------------------------------------------

function ToggleBadge({
  value,
  payoutId,
  field,
  onToggled,
}: {
  value: boolean;
  payoutId: string;
  field: "isSigned" | "isPaid" | "addedToSlack";
  onToggled: () => void;
}) {
  const [pending, setPending] = useState(false);

  const toggle = async () => {
    setPending(true);
    try {
      const res = await fetch("/api/admin/payouts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: payoutId, [field]: !value }),
      });
      if (res.ok) onToggled();
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={pending}
      aria-label={`Toggle ${field === "isSigned" ? "signed" : field === "isPaid" ? "paid" : "slack"}: currently ${value ? "yes" : "no"}`}
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
        pending && "opacity-50",
        value
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
          : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
      )}
    >
      {value ? "Yes" : "No"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Inline Pay Distributed selector
// ---------------------------------------------------------------------------

function PayDistributedBadge({
  value,
  payoutId,
  onChanged,
}: {
  value: PayDistributed;
  payoutId: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const colors: Record<PayDistributed, string> = {
    Yes: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
    No: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",
    "Hold Til Full Pay":
      "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400",
  };

  const select = async (newVal: PayDistributed) => {
    setOpen(false);
    if (newVal === value) return;
    const res = await fetch("/api/admin/payouts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: payoutId, payDistributed: newVal }),
    });
    if (res.ok) onChanged();
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer",
          colors[value]
        )}
      >
        {value === "Hold Til Full Pay" ? "Hold" : value}
      </button>
      {open && (
        <PayDistributedDropdown
          current={value}
          onSelect={select}
          onClose={() => setOpen(false)}
          anchorRef={btnRef}
        />
      )}
    </div>
  );
}

function PayDistributedDropdown({
  current,
  onSelect,
  onClose,
  anchorRef,
}: {
  current: PayDistributed;
  onSelect: (v: PayDistributed) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const options: PayDistributed[] = ["Yes", "No", "Hold Til Full Pay"];

  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left });
  }, [anchorRef]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div
        className="fixed z-[61] w-44 rounded-lg border border-border bg-popover shadow-lg py-1 animate-in fade-in-0 zoom-in-95 duration-100"
        style={{ top: pos.top, left: pos.left }}
      >
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onSelect(opt)}
            className={cn(
              "flex w-full items-center px-3 py-1.5 text-sm transition-colors",
              opt === current
                ? "bg-accent text-accent-foreground"
                : "text-foreground hover:bg-accent"
            )}
          >
            {opt}
          </button>
        ))}
      </div>
    </>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Actions dropdown (portal)
// ---------------------------------------------------------------------------

function ActionsDropdown({
  payout,
  onEdit,
  onDelete,
  onClose,
  anchorRef,
}: {
  payout: PayoutRecord;
  onEdit: (p: PayoutRecord) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.right - 192 });
  }, [anchorRef]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div
        className="fixed z-[61] w-48 rounded-lg border border-border bg-popover shadow-lg py-1 animate-in fade-in-0 zoom-in-95 duration-100"
        style={{ top: pos.top, left: pos.left }}
      >
        <button
          onClick={() => {
            onClose();
            onEdit(payout);
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
        <button
          onClick={() => {
            onClose();
            onDelete(payout.id);
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      </div>
    </>,
    document.body
  );
}

function ActionsCell({
  payout,
  onEdit,
  onDelete,
}: {
  payout: PayoutRecord;
  onEdit: (p: PayoutRecord) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        aria-label="Payout actions"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <ActionsDropdown
          payout={payout}
          onEdit={onEdit}
          onDelete={onDelete}
          onClose={() => setOpen(false)}
          anchorRef={btnRef}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Delete confirmation
// ---------------------------------------------------------------------------

function DeleteConfirm({
  brandName,
  onConfirm,
  onCancel,
}: {
  brandName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border/50 dark:border-white/[0.06] bg-card p-6 shadow-xl mx-4">
        <h4 className="text-lg font-semibold text-foreground">Delete Payout</h4>
        <p className="text-sm text-muted-foreground mt-2">
          Are you sure you want to delete the payout for{" "}
          <span className="font-medium text-foreground">{brandName}</span>?
          This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-destructive hover:bg-destructive/90 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail modal (reused for notes + service)
// ---------------------------------------------------------------------------

function DetailModal({
  brandName,
  label,
  content,
  onClose,
}: {
  brandName: string;
  label: string;
  content: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border/50 dark:border-white/[0.06] bg-card p-6 shadow-xl mx-4">
        <h4 className="text-sm font-semibold text-foreground">{brandName}</h4>
        <p className="text-xs text-muted-foreground mb-3">{label}</p>
        <p className="text-sm text-foreground whitespace-pre-wrap">{content}</p>
        <div className="flex justify-end mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Table
// ---------------------------------------------------------------------------

interface PayoutTableProps {
  payouts: PayoutRecord[];
  isLoading: boolean;
  onEdit: (payout: PayoutRecord) => void;
  onRefresh: () => void;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function PayoutTable({
  payouts,
  isLoading,
  onEdit,
  onRefresh,
}: PayoutTableProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [notesId, setNotesId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [dateSort, setDateSort] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    return [...payouts].sort((a, b) => {
      const da = a.dateJoined ?? "";
      const db = b.dateJoined ?? "";
      if (da === db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return dateSort === "asc"
        ? da.localeCompare(db)
        : db.localeCompare(da);
    });
  }, [payouts, dateSort]);

  const deletePayout = sorted.find((p) => p.id === deleteId);
  const notesPayout = sorted.find((p) => p.id === notesId);
  const servicePayout = sorted.find((p) => p.id === serviceId);

  const handleDelete = async () => {
    if (!deleteId) return;
    const res = await fetch(`/api/admin/payouts?id=${encodeURIComponent(deleteId)}`, { method: "DELETE" });
    setDeleteId(null);
    if (res.ok) onRefresh();
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-16 rounded-xl bg-muted/50 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (payouts.length === 0) {
    return (
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-12 text-center">
        <p className="text-muted-foreground text-sm">
          No payouts for this month.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block rounded-xl border border-border/50 dark:border-white/[0.06] bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 dark:border-white/[0.06] bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Brand
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  <SortHeader
                    label="Joined"
                    active={true}
                    direction={dateSort}
                    onToggle={() => setDateSort(dateSort === "asc" ? "desc" : "asc")}
                  />
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Vertical
                </th>
                <th className="text-center px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Service
                </th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Due
                </th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Paid
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Sales Rep
                </th>
                <th className="text-center px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Signed
                </th>
                <th className="text-center px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Paid
                </th>
                <th className="text-center px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Slack
                </th>
                <th className="text-center px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Distributed
                </th>
                <th className="text-center px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Notes
                </th>
                <th className="px-2 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const underpaid = p.amountDue > p.amountPaid;
                return (
                <tr
                  key={p.id}
                  className={cn(
                    "border-b border-border/50 dark:border-white/[0.06] last:border-0 transition-colors",
                    underpaid
                      ? "bg-red-50/60 hover:bg-red-50 dark:bg-red-500/[0.07] dark:hover:bg-red-500/[0.12]"
                      : "hover:bg-muted/20"
                  )}
                >
                  <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                    {p.brandName}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {formatDate(p.dateJoined)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {p.vertical || "—"}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {p.service ? (
                      <button
                        onClick={() => setServiceId(p.id)}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-violet-500 hover:bg-violet-500/10 transition-colors"
                      >
                        <Briefcase className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-foreground whitespace-nowrap">
                    {formatCents(p.amountDue)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-foreground whitespace-nowrap">
                    {formatCents(p.amountPaid)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {p.salesRep || "—"}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <ToggleBadge
                      value={p.isSigned}
                      payoutId={p.id}
                      field="isSigned"
                      onToggled={onRefresh}
                    />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <ToggleBadge
                      value={p.isPaid}
                      payoutId={p.id}
                      field="isPaid"
                      onToggled={onRefresh}
                    />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <ToggleBadge
                      value={p.addedToSlack}
                      payoutId={p.id}
                      field="addedToSlack"
                      onToggled={onRefresh}
                    />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <PayDistributedBadge
                      value={p.payDistributed}
                      payoutId={p.id}
                      onChanged={onRefresh}
                    />
                  </td>
                  <td className="px-3 py-3 text-center">
                    {p.paymentNotes ? (
                      <button
                        onClick={() => setNotesId(p.id)}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-amber-500 hover:bg-amber-500/10 transition-colors"
                      >
                        <StickyNote className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="px-2 py-3">
                    <ActionsCell
                      payout={p}
                      onEdit={onEdit}
                      onDelete={setDeleteId}
                    />
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {sorted.map((p) => {
          const underpaid = p.amountDue > p.amountPaid;
          return (
          <div
            key={p.id}
            className={cn(
              "rounded-lg border p-4",
              underpaid
                ? "border-red-200 dark:border-red-500/20 bg-red-50/60 dark:bg-red-500/[0.07]"
                : "border-border/50 dark:border-white/[0.06] bg-background/50"
            )}
          >
            {/* Top: Brand + date + actions */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <p className="font-medium text-foreground text-sm truncate">
                  {p.brandName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.vertical || "—"} &middot; {formatDate(p.dateJoined)}
                </p>
                {p.service && (
                  <button
                    onClick={() => setServiceId(p.id)}
                    className="inline-flex items-center gap-1 text-xs text-violet-500 hover:text-violet-600 transition-colors mt-0.5"
                  >
                    <Briefcase className="h-3 w-3" />
                    View Service
                  </button>
                )}
              </div>
              <ActionsCell
                payout={p}
                onEdit={onEdit}
                onDelete={setDeleteId}
              />
            </div>

            {/* Amounts + Sales Rep */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div>
                  <span className="text-[10px] text-muted-foreground block">Due</span>
                  <span className="font-semibold text-foreground text-sm">
                    {formatCents(p.amountDue)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">Paid</span>
                  <span className="font-semibold text-foreground text-sm">
                    {formatCents(p.amountPaid)}
                  </span>
                </div>
              </div>
              <span className="text-xs text-muted-foreground truncate ml-2">
                {p.salesRep || "No rep"}
              </span>
            </div>

            {/* Status badges with labels */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground">Signed</span>
                <ToggleBadge
                  value={p.isSigned}
                  payoutId={p.id}
                  field="isSigned"
                  onToggled={onRefresh}
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground">Paid</span>
                <ToggleBadge
                  value={p.isPaid}
                  payoutId={p.id}
                  field="isPaid"
                  onToggled={onRefresh}
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground">Slack</span>
                <ToggleBadge
                  value={p.addedToSlack}
                  payoutId={p.id}
                  field="addedToSlack"
                  onToggled={onRefresh}
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground">Dist.</span>
                <PayDistributedBadge
                  value={p.payDistributed}
                  payoutId={p.id}
                  onChanged={onRefresh}
                />
              </div>
            </div>

            {/* Payment notes icon */}
            {p.paymentNotes && (
              <div className="mt-3 pt-3 border-t border-border/50 dark:border-white/[0.06] flex items-center gap-1.5">
                <button
                  onClick={() => setNotesId(p.id)}
                  className="inline-flex items-center gap-1 text-xs text-amber-500 hover:text-amber-600 transition-colors"
                >
                  <StickyNote className="h-3 w-3" />
                  View Notes
                </button>
              </div>
            )}
          </div>
          );
        })}
      </div>

      {/* Service modal */}
      {serviceId && servicePayout?.service && (
        <DetailModal
          brandName={servicePayout.brandName}
          label="Service"
          content={servicePayout.service}
          onClose={() => setServiceId(null)}
        />
      )}

      {/* Notes modal */}
      {notesId && notesPayout?.paymentNotes && (
        <DetailModal
          brandName={notesPayout.brandName}
          label="Payment Notes"
          content={notesPayout.paymentNotes}
          onClose={() => setNotesId(null)}
        />
      )}

      {/* Delete confirmation */}
      {deleteId && deletePayout && (
        <DeleteConfirm
          brandName={deletePayout.brandName}
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </>
  );
}
