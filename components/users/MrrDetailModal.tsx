"use client";

import { useState, useEffect, useCallback } from "react";
import { X, DollarSign, ChevronDown, ChevronLeft, GitBranch } from "lucide-react";
import { formatCents } from "@/components/closers/types";
import { cn } from "@/lib/utils";
import type { PayoutRecord } from "@/lib/payouts";

interface MrrDetailModalProps {
  open: boolean;
  onClose: () => void;
  clientName: string;
  mrrCents: number;
}

function formatDate(value: string | null): string {
  if (!value) return "\u2014";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function TogglePill({ value, label }: { value: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
        value
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
      )}
    >
      {value ? "Yes" : "No"}
    </span>
  );
}

/* ── Mobile card — matches PayoutTable mobile card layout ────── */
function MobilePayoutCard({ record }: { record: PayoutRecord }) {
  const underpaid = !record.isPaid && record.amountDue > record.amountPaid;

  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        underpaid
          ? "border-red-200 dark:border-red-500/20 bg-red-50/60 dark:bg-red-500/[0.07]"
          : "border-border/50 dark:border-white/[0.06] bg-background/50"
      )}
    >
      {/* Brand + vertical + date */}
      <div className="min-w-0 mb-2">
        <p className="font-medium text-foreground text-sm truncate">
          {record.brandName}
        </p>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {record.vertical && <span>{record.vertical}</span>}
          {record.vertical && record.dateJoined && <span>&middot;</span>}
          {record.dateJoined && <span>{formatDate(record.dateJoined)}</span>}
        </div>
        {(record.pointOfContact || record.service) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            {record.pointOfContact && <span>POC: {record.pointOfContact}</span>}
            {record.pointOfContact && record.service && <span>&middot;</span>}
            {record.service && <span>{record.service}</span>}
          </div>
        )}
      </div>

      {/* Amounts */}
      <div className="flex items-center gap-4 mb-2">
        <div>
          <span className="text-[10px] text-muted-foreground block">Due</span>
          <span className="font-semibold text-foreground text-sm">
            {formatCents(record.amountDue)}
          </span>
        </div>
        <div>
          <span className="text-[10px] text-muted-foreground block">Paid</span>
          <span className="font-semibold text-foreground text-sm">
            {formatCents(record.amountPaid)}
          </span>
        </div>
        {record.firstDayAdSpend && (
          <div>
            <span className="text-[10px] text-muted-foreground block">1st Ad Spend</span>
            <span className="text-xs text-foreground">{formatDate(record.firstDayAdSpend)}</span>
          </div>
        )}
      </div>

      {/* Sales Rep */}
      {record.salesRep && (
        <div className="flex items-center gap-1 mb-2 min-w-0">
          <span className="text-[10px] text-muted-foreground shrink-0">Rep</span>
          <span className="text-xs text-foreground truncate">{record.salesRep}</span>
        </div>
      )}

      {/* Referral */}
      {(record.referral || record.referralPct != null) && (
        <div className="flex items-center gap-1 mb-2 min-w-0">
          <span className="text-[10px] text-muted-foreground shrink-0">Ref</span>
          <span className="text-xs text-foreground truncate">
            {record.referral || "\u2014"}
            {record.referralPct != null && ` (${record.referralPct}%)`}
          </span>
        </div>
      )}

      {/* Status badges */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">Signed</span>
          <TogglePill value={record.isSigned} label="Signed" />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">Paid</span>
          <TogglePill value={record.isPaid} label="Paid" />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">Slack</span>
          <TogglePill value={record.addedToSlack} label="Slack" />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">Dist.</span>
          <span className={cn(
            "inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
            record.payDistributed === "Yes"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
              : record.payDistributed === "Hold Til Full Pay"
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          )}>
            {record.payDistributed === "Hold Til Full Pay" ? "Hold" : record.payDistributed}
          </span>
        </div>
        {record.commissionSplit && record.splitDetails.length > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">Split</span>
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400">
              <GitBranch className="h-3 w-3" />
              {record.splitDetails.map((s) => `${s.name}: ${s.pct}%`).join(", ")}
            </span>
          </div>
        )}
        {record.payDistributedDate && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">Dist. Date</span>
            <span className="text-[11px] text-muted-foreground">{formatDate(record.payDistributedDate)}</span>
          </div>
        )}
      </div>

      {/* Payment notes */}
      {record.paymentNotes && (
        <div className="mt-3 pt-3 border-t border-border/50 dark:border-white/[0.06]">
          <p className="text-[10px] text-muted-foreground mb-0.5">Notes</p>
          <p className="text-xs text-foreground whitespace-pre-wrap">{record.paymentNotes}</p>
        </div>
      )}
    </div>
  );
}

/* ── Desktop expandable row — matches RebillDetailModal ──────── */
function DesktopPayoutRow({ record }: { record: PayoutRecord }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors"
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground shrink-0 transition-transform",
            expanded && "rotate-180"
          )}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground truncate">
              {record.brandName}
            </p>
            <span
              className={cn(
                "shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
                record.isPaid
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              )}
            >
              {record.isPaid ? "Paid" : "Unpaid"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {[record.vertical, record.service, record.salesRep]
              .filter(Boolean)
              .join(" \u00b7 ") || "No details"}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-foreground">
            {formatCents(record.amountDue)}
          </p>
          {record.amountPaid > 0 && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              {formatCents(record.amountPaid)} paid
            </p>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 md:pl-11">
          <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Amount Due" value={formatCents(record.amountDue)} />
              <Field label="Amount Paid" value={formatCents(record.amountPaid)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Vertical" value={record.vertical} />
              <Field label="Service" value={record.service} />
              <Field label="Sales Rep" value={record.salesRep} />
              <Field label="Point of Contact" value={record.pointOfContact} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Date Joined" value={formatDate(record.dateJoined)} />
              <Field label="1st Day Ad Spend" value={formatDate(record.firstDayAdSpend)} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">
                Status
              </p>
              <div className="flex flex-wrap gap-1.5">
                <StatusBadge value={record.isSigned} label="Signed" />
                <StatusBadge value={record.isPaid} label="Paid" />
                <StatusBadge value={record.addedToSlack} label="Slack" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Pay Distributed" value={record.payDistributed} />
              <Field label="Dist. Date" value={formatDate(record.payDistributedDate)} />
            </div>
            {(record.referral || record.referralPct) && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Referral" value={record.referral} />
                <Field
                  label="Referral %"
                  value={record.referralPct != null ? `${record.referralPct}%` : null}
                />
              </div>
            )}
            {record.commissionSplit && record.splitDetails.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">
                  Commission Split
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {record.splitDetails.map((s) => (
                    <span
                      key={s.name}
                      className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400"
                    >
                      {s.name}: {s.pct}%
                    </span>
                  ))}
                </div>
              </div>
            )}
            {record.paymentNotes && (
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">
                  Payment Notes
                </p>
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {record.paymentNotes}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ value, label }: { value: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
        value
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
      )}
    >
      {label}: {value ? "Yes" : "No"}
    </span>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value || value === "\u2014") return null;
  return (
    <div>
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">
        {label}
      </p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}

export function MrrDetailModal({
  open,
  onClose,
  clientName,
  mrrCents,
}: MrrDetailModalProps) {
  const [records, setRecords] = useState<PayoutRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    fetch(
      `/api/admin/payouts/by-brand?clientName=${encodeURIComponent(clientName)}`,
      { signal: controller.signal }
    )
      .then((res) => res.json())
      .then((json) => setRecords(json.data ?? []))
      .catch((err) => {
        if (err.name !== "AbortError") setRecords([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, clientName]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  const statusBar = (
    <div className="flex items-center justify-between px-4 md:px-6 py-3 bg-emerald-50/50 dark:bg-emerald-950/20 border-b border-border/50">
      <div className="flex items-center gap-2">
        <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        <span className="text-sm font-medium text-foreground">
          {records.length} payout record{records.length !== 1 ? "s" : ""}
        </span>
      </div>
      <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
        {formatCents(mrrCents)}
      </span>
    </div>
  );

  const emptyOrLoading = loading ? (
    <p className="px-4 md:px-6 py-8 text-sm text-muted-foreground text-center">
      Loading...
    </p>
  ) : records.length === 0 ? (
    <p className="px-4 md:px-6 py-8 text-sm text-muted-foreground text-center">
      No payout records found this month
    </p>
  ) : null;

  return (
    <>
      {/* Mobile: full-screen */}
      <div className="fixed inset-0 z-50 flex flex-col bg-background md:hidden">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h3 className="text-lg font-semibold text-foreground truncate">
            MRR &mdash; {clientName}
          </h3>
        </div>

        {statusBar}

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {emptyOrLoading || records.map((r) => (
            <MobilePayoutCard key={r.id} record={r} />
          ))}
        </div>
      </div>

      {/* Desktop: centered dialog */}
      <div className="hidden md:flex fixed inset-0 z-50 items-center justify-center">
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />
        <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden mx-4">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h3 className="text-lg font-semibold text-foreground truncate pr-4">
              Monthly MRR &mdash; {clientName}
            </h3>
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {statusBar}

          <div className="max-h-[70vh] overflow-y-auto">
            {emptyOrLoading || records.map((r) => (
              <DesktopPayoutRow key={r.id} record={r} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
