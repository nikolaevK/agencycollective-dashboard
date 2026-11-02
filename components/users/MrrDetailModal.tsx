"use client";

import { useState, useEffect, useCallback } from "react";
import { X, DollarSign, ChevronDown, ChevronLeft, GitBranch } from "lucide-react";
import { formatCents } from "@/components/closers/types";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PayoutRecord } from "@/lib/payouts";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dialogOverlayClass, dialogPanelClass } from "@/components/ui/dialog";
import { sheetPanelClass } from "@/components/ui/sheet";

interface MrrDetailModalProps {
  open: boolean;
  onClose: () => void;
  clientName: string;
  mrrCents: number;
}

function TogglePill({ value, label }: { value: boolean; label: string }) {
  return (
    <StatusBadge tone={value ? "success" : "danger"}>
      {value ? "Yes" : "No"}
    </StatusBadge>
  );
}

/* ── Mobile card — matches PayoutTable mobile card layout ────── */
function MobilePayoutCard({ record }: { record: PayoutRecord }) {
  const underpaid = !record.isPaid && record.amountDue > record.amountPaid;

  return (
    <div
      className={cn(
        "rounded-2xl p-4 ring-1",
        underpaid
          ? "bg-red-500/[0.05] ring-red-500/25 dark:bg-red-400/[0.07] dark:ring-red-400/20"
          : "ring-foreground/5 dark:ring-foreground/10"
      )}
    >
      {/* Brand + vertical + date */}
      <div className="min-w-0 mb-3">
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
      <div className="flex items-center gap-4 mb-3">
        <div>
          <span className="text-xs text-muted-foreground block">Due</span>
          <span className="font-semibold tracking-tight tabular-nums text-foreground text-sm">
            {formatCents(record.amountDue)}
          </span>
        </div>
        <div>
          <span className="text-xs text-muted-foreground block">Paid</span>
          <span className="font-semibold tracking-tight tabular-nums text-foreground text-sm">
            {formatCents(record.amountPaid)}
          </span>
        </div>
        {record.firstDayAdSpend && (
          <div>
            <span className="text-xs text-muted-foreground block">1st Ad Spend</span>
            <span className="text-xs text-foreground">{formatDate(record.firstDayAdSpend)}</span>
          </div>
        )}
      </div>

      {/* Sales Rep */}
      {record.salesRep && (
        <div className="flex items-center gap-1.5 mb-2 min-w-0">
          <span className="text-xs text-muted-foreground shrink-0">Rep</span>
          <span className="text-xs text-foreground truncate">{record.salesRep}</span>
        </div>
      )}

      {/* Referral */}
      {(record.referral || record.referralPct != null) && (
        <div className="flex items-center gap-1.5 mb-2 min-w-0">
          <span className="text-xs text-muted-foreground shrink-0">Ref</span>
          <span className="text-xs text-foreground truncate">
            {record.referral || "\u2014"}
            {record.referralPct != null && ` (${record.referralPct}%)`}
          </span>
        </div>
      )}

      {/* Status badges */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Signed</span>
          <TogglePill value={record.isSigned} label="Signed" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Paid</span>
          <TogglePill value={record.isPaid} label="Paid" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Slack</span>
          <TogglePill value={record.addedToSlack} label="Slack" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Dist.</span>
          <StatusBadge
            tone={
              record.payDistributed === "Yes"
                ? "success"
                : record.payDistributed === "Hold Til Full Pay"
                  ? "warning"
                  : "danger"
            }
          >
            {record.payDistributed === "Hold Til Full Pay" ? "Hold" : record.payDistributed}
          </StatusBadge>
        </div>
        {record.commissionSplit && record.splitDetails.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Split</span>
            <Badge variant="outline" className="h-auto whitespace-normal">
              <GitBranch />
              {record.splitDetails.map((s) => `${s.name}: ${s.pct}%`).join(", ")}
            </Badge>
          </div>
        )}
        {record.payDistributedDate && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Dist. Date</span>
            <span className="text-xs text-muted-foreground">{formatDate(record.payDistributedDate)}</span>
          </div>
        )}
      </div>

      {/* Payment notes */}
      {record.paymentNotes && (
        <div className="mt-3 pt-3 border-t">
          <p className="text-xs text-muted-foreground mb-0.5">Notes</p>
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
    <div className="border-b last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-6 py-3 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
      >
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground shrink-0 transition-transform",
            expanded && "rotate-180"
          )}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground truncate">
              {record.brandName}
            </p>
            <StatusBadge tone={record.isPaid ? "success" : "danger"} className="shrink-0">
              {record.isPaid ? "Paid" : "Unpaid"}
            </StatusBadge>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {[record.vertical, record.service, record.salesRep]
              .filter(Boolean)
              .join(" \u00b7 ") || "No details"}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold tabular-nums text-foreground">
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
        <div className="px-6 pb-4 pt-1 md:pl-[3.25rem]">
          <div className="rounded-2xl bg-muted/50 p-4 space-y-4">
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
              <p className="text-xs text-muted-foreground mb-1.5">
                Status
              </p>
              <div className="flex flex-wrap gap-1.5">
                <YesNoBadge value={record.isSigned} label="Signed" />
                <YesNoBadge value={record.isPaid} label="Paid" />
                <YesNoBadge value={record.addedToSlack} label="Slack" />
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
                <p className="text-xs text-muted-foreground mb-1.5">
                  Commission Split
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {record.splitDetails.map((s) => (
                    <Badge key={s.name} variant="outline">
                      {s.name}: {s.pct}%
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {record.paymentNotes && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">
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

function YesNoBadge({ value, label }: { value: boolean; label: string }) {
  return (
    <StatusBadge tone={value ? "success" : "danger"}>
      {label}: {value ? "Yes" : "No"}
    </StatusBadge>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value || value === "\u2014") return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">
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
    <div className="flex shrink-0 items-center justify-between gap-3 px-4 md:px-6 py-3 bg-muted/50 border-y">
      <div className="flex min-w-0 items-center gap-2">
        <DollarSign className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">
          {records.length} payout record{records.length !== 1 ? "s" : ""}
        </span>
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
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
      <div className={cn(sheetPanelClass, "fixed inset-0 z-[60] md:hidden")}>
        <div className="flex items-center gap-2 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close"
            className="-ml-2 shrink-0 text-muted-foreground"
          >
            <ChevronLeft className="size-5" />
          </Button>
          <h3 className="text-base font-medium text-foreground truncate">
            MRR &mdash; {clientName}
          </h3>
        </div>

        {statusBar}

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-3">
          {emptyOrLoading || records.map((r) => (
            <MobilePayoutCard key={r.id} record={r} />
          ))}
        </div>
      </div>

      {/* Desktop: centered dialog */}
      <div className="hidden md:flex fixed inset-0 z-[60] items-center justify-center">
        <div
          className={cn(dialogOverlayClass, "absolute z-0")}
          onClick={onClose}
        />
        <div className={cn(dialogPanelClass, "relative z-10 mx-4 w-full max-w-2xl overflow-hidden")}>
          <div className="flex items-center justify-between gap-4 px-6 py-5">
            <h3 className="text-base font-medium leading-none text-foreground truncate">
              Monthly MRR &mdash; {clientName}
            </h3>
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

          {statusBar}

          <div className="max-h-[70vh] overflow-y-auto overscroll-contain">
            {emptyOrLoading || records.map((r) => (
              <DesktopPayoutRow key={r.id} record={r} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
