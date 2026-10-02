"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  RotateCcw,
  CalendarRange,
  RefreshCw,
  Lock,
  Link2,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { cycleOptionsAround } from "@/lib/clientBilling";
import type { PayoutLinkOption } from "@/lib/payouts";
import { formatCentsExact } from "@/lib/format";
import { formatDate } from "./format";

const FIELD =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20";
const LABEL =
  "text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block leading-tight";

type InvoiceStatus = "sent" | "paid" | "unpaid" | "superseded";

/** The slice of an invoice (client re-bill OR ad-account) the panel needs. */
export interface OverridableInvoice {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  cycleAnchor: string;
  paidSource: "auto" | "manual" | "payout" | null;
  paidPayoutId: string | null;
  paidPayoutMonth: number | null;
  paidPayoutYear: number | null;
  reconcileLocked: boolean;
  manualNote: string | null;
}

type Mode = null | "paid" | "link" | "unpaid" | "cycle";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthLabel(year: number, month: number): string {
  return `${MONTHS[month - 1] ?? month} ${year}`;
}

/**
 * Small provenance strip rendered under an invoice row: how it got paid
 * (auto / by hand / linked payout), whether it's locked against the
 * automation, and the admin's note.
 */
export function InvoiceProvenance({ invoice }: { invoice: OverridableInvoice }) {
  const bits: React.ReactNode[] = [];
  if (invoice.status === "paid") {
    if (invoice.paidSource === "payout") {
      bits.push(
        <span key="src" className="inline-flex items-center gap-1">
          <Link2 className="h-3 w-3" />
          linked to payout
          {invoice.paidPayoutMonth && invoice.paidPayoutYear
            ? ` (${monthLabel(invoice.paidPayoutYear, invoice.paidPayoutMonth)})`
            : ""}
        </span>
      );
    } else if (invoice.paidSource === "manual") {
      bits.push(<span key="src">marked paid by hand</span>);
    } else if (invoice.paidPayoutMonth && invoice.paidPayoutYear) {
      bits.push(
        <span key="src">
          matched payout {monthLabel(invoice.paidPayoutYear, invoice.paidPayoutMonth)}
        </span>
      );
    }
  }
  if (invoice.reconcileLocked) {
    bits.push(
      <span key="lock" className="inline-flex items-center gap-1" title="Set by hand — auto-reconciliation is paused until Resync">
        <Lock className="h-3 w-3" />
        manual
      </span>
    );
  }
  if (invoice.manualNote) {
    bits.push(
      <span key="note" className="italic truncate max-w-[260px]" title={invoice.manualNote}>
        “{invoice.manualNote}”
      </span>
    );
  }
  if (bits.length === 0) return null;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
      {bits}
    </p>
  );
}

interface Props {
  invoice: OverridableInvoice;
  /** The schedule's recomputed next cycle — offered as the "current cycle". */
  currentCycle: string | null;
  /** PATCH endpoint for this invoice (manual override body). */
  patchUrl: string;
  /** GET endpoint listing linkable payout rows; null hides payout linking. */
  payoutOptionsUrl: string | null;
  /** The schedule's current `paid` flag — surfaces a hint when Mark unpaid
   *  would be contradicted by a qualifying payout that still covers the cycle. */
  schedulePaid?: boolean;
  onChanged: () => void;
}

/**
 * Manual controls for one invoice: mark paid (optionally linked to a payout
 * row), mark unpaid, reopen, re-anchor the billing cycle, and hand the row
 * back to the automation. Renders a compact "Manage" toggle that expands an
 * inline action strip + sub-form below the row.
 */
export function InvoiceOverridePanel({
  invoice,
  currentCycle,
  patchUrl,
  payoutOptionsUrl,
  schedulePaid,
  onChanged,
}: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  // Which PATCH is in flight: "form" (a sub-form submit) or the immediate
  // action ("reopen" | "unlink" | "resync") — that button shows the spinner.
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const busy = busyAction !== null;
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [payoutId, setPayoutId] = useState("");
  const [payouts, setPayouts] = useState<PayoutLinkOption[] | null>(null);
  const [payoutsError, setPayoutsError] = useState(false);
  const [cycle, setCycle] = useState(invoice.cycleAnchor);

  useEffect(() => {
    setCycle(invoice.cycleAnchor);
  }, [invoice.cycleAnchor]);

  // Load the brand's payout rows lazily, only when the paid form opens.
  useEffect(() => {
    if ((mode !== "paid" && mode !== "link") || !payoutOptionsUrl || payouts !== null) return;
    let cancelled = false;
    fetch(payoutOptionsUrl)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setPayouts((json.data?.payouts as PayoutLinkOption[]) ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setPayouts([]);
          setPayoutsError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [mode, payoutOptionsUrl, payouts]);

  async function patch(body: Record<string, unknown>, action = "form") {
    setBusyAction(action);
    setError(null);
    try {
      const res = await fetch(patchUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setMode(null);
      setNote("");
      setPayoutId("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusyAction(null);
    }
  }

  const cycleChoices = currentCycle ? cycleOptionsAround(currentCycle) : [];
  const isOnCurrentCycle = currentCycle != null && invoice.cycleAnchor === currentCycle;
  const isSuperseded = invoice.status === "superseded";

  function switchMode(next: Mode) {
    setMode((m) => (m === next ? null : next));
    setError(null);
    setNote("");
    setPayoutId("");
  }

  return (
    <div className="w-full">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          setMode(null);
          setError(null);
        }}
        // Padding enlarges the hit area; the negative margin keeps the
        // compact visual footprint.
        className="-mx-2 -my-1.5 inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
      >
        Manage
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && isSuperseded && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Superseded — a newer invoice replaced this one. It keeps its record but can no
          longer change status; manage the newer invoice instead.
        </p>
      )}

      {open && !isSuperseded && (
        <div className="mt-2 rounded-lg border border-border/50 bg-muted/20 p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {invoice.status !== "paid" && (
              <ActionButton
                icon={CheckCircle2}
                label="Mark paid"
                tone="green"
                active={mode === "paid"}
                onClick={() => switchMode("paid")}
              />
            )}
            {invoice.status === "paid" && invoice.paidSource !== "payout" && payoutOptionsUrl && (
              <ActionButton
                icon={Link2}
                label="Link payout"
                active={mode === "link"}
                onClick={() => switchMode("link")}
              />
            )}
            {invoice.status !== "unpaid" && (
              <ActionButton
                icon={XCircle}
                label="Mark unpaid"
                tone="red"
                active={mode === "unpaid"}
                onClick={() => switchMode("unpaid")}
              />
            )}
            {invoice.status !== "sent" && (
              <ActionButton
                icon={RotateCcw}
                label="Reopen (awaiting)"
                disabled={busy}
                loading={busyAction === "reopen"}
                onClick={() => {
                  if (!confirm(`Reopen ${invoice.invoiceNumber} as awaiting payment?\n\nIt stays locked from auto-matching until you Resync.`)) return;
                  patch({ status: "sent" }, "reopen");
                }}
              />
            )}
            <ActionButton
              icon={CalendarRange}
              label="Set cycle"
              active={mode === "cycle"}
              onClick={() => switchMode("cycle")}
            />
            {invoice.status === "paid" && invoice.paidSource === "payout" && (
              <ActionButton
                icon={Link2}
                label="Unlink payout"
                disabled={busy}
                loading={busyAction === "unlink"}
                onClick={() => {
                  if (!confirm(`Unlink the payout from ${invoice.invoiceNumber}?\n\nThe invoice stays paid (by hand) — only the payout reference is removed.`)) return;
                  patch({ paidPayoutId: null }, "unlink");
                }}
              />
            )}
            {invoice.reconcileLocked && (
              <ActionButton
                icon={RefreshCw}
                label="Resync with payouts"
                disabled={busy}
                loading={busyAction === "resync"}
                onClick={() => {
                  if (!confirm(`Hand ${invoice.invoiceNumber} back to the automation?\n\nManual markers and the note are cleared, the invoice returns to awaiting, and the Payout DB decides again whether it's paid.`)) return;
                  patch({ resync: true }, "resync");
                }}
              />
            )}
          </div>

          {(mode === "paid" || mode === "link") && (
            <div className="space-y-2">
              {payoutOptionsUrl && (
                <div>
                  <label className={LABEL}>
                    {mode === "link" ? "Payout to link" : "Link to a payout (optional)"}
                  </label>
                  {payouts === null ? (
                    <div className="h-9 w-full animate-pulse rounded-lg bg-muted/60" />
                  ) : (
                    <select
                      className={FIELD}
                      value={payoutId}
                      onChange={(e) => setPayoutId(e.target.value)}
                    >
                      <option value="">
                        {mode === "link" ? "Choose a payout…" : "No payout — mark paid by hand"}
                      </option>
                      {payouts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {monthLabel(p.payoutYear, p.payoutMonth)} · {p.brandName} ·{" "}
                          {formatCentsExact(p.amountPaid || p.amountDue)}
                          {p.salesRep ? ` · ${p.salesRep}` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                  {payoutsError ? (
                    <p className="mt-1 flex items-center gap-2 text-[11px] text-red-600 dark:text-red-400">
                      Couldn&rsquo;t load payout rows.
                      <button
                        type="button"
                        onClick={() => {
                          // Back to null re-runs the lazy loader above.
                          setPayoutsError(false);
                          setPayouts(null);
                        }}
                        className="font-semibold underline underline-offset-2 hover:text-foreground"
                      >
                        Retry
                      </button>
                    </p>
                  ) : (
                    payouts !== null &&
                    payouts.length === 0 && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        No payout rows found for this brand.
                      </p>
                    )
                  )}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Linking records which payment settled this cycle. If the payment was booked
                    under the wrong month, edit its Payout Month on the Payouts page instead —
                    that moves it for the schedule too.
                  </p>
                </div>
              )}
              {mode === "paid" && (
                <NoteField value={note} onChange={setNote} placeholder="Why / how it was paid (optional)" />
              )}
              <SubmitRow
                busy={busy}
                disabled={mode === "link" && !payoutId}
                label={mode === "link" ? "Link payout" : "Confirm paid"}
                onCancel={() => setMode(null)}
                onSubmit={() =>
                  mode === "link"
                    ? patch({ paidPayoutId: payoutId })
                    : patch({
                        status: "paid",
                        ...(payoutId ? { paidPayoutId: payoutId } : {}),
                        note: note || null,
                      })
                }
              />
            </div>
          )}

          {mode === "unpaid" && (
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground">
                Records that this cycle went unpaid. The next bill date does not move.
              </p>
              {schedulePaid && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  A qualifying payout in the Payout DB still covers this cycle, so the row will
                  keep its Paid chip. Correct or move that payout if it doesn&rsquo;t belong here.
                </p>
              )}
              <NoteField value={note} onChange={setNote} placeholder="Reason (optional)" />
              <SubmitRow
                busy={busy}
                label="Confirm unpaid"
                onCancel={() => setMode(null)}
                onSubmit={() => patch({ status: "unpaid", note: note || null })}
              />
            </div>
          )}

          {mode === "cycle" && (
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground">
                Which billing cycle this invoice covers.{" "}
                {currentCycle ? (
                  isOnCurrentCycle ? (
                    <>It is on the current cycle ({formatDate(currentCycle)}).</>
                  ) : (
                    <>The current cycle is {formatDate(currentCycle)} — align to it for the &ldquo;Invoice sent&rdquo; status.</>
                  )
                ) : null}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {cycleChoices.length > 0 && (
                  <select
                    className={FIELD}
                    value={cycleChoices.some((c) => c.date === cycle) ? cycle : ""}
                    onChange={(e) => e.target.value && setCycle(e.target.value)}
                  >
                    <option value="" disabled>
                      Pick a cycle… (or type a date)
                    </option>
                    {cycleChoices.map((c) => (
                      <option key={c.date} value={c.date}>
                        {formatDate(c.date)}
                        {c.offset === 0 ? " (current)" : c.offset < 0 ? " (previous)" : " (future)"}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  type="date"
                  className={FIELD}
                  value={cycle}
                  onChange={(e) => setCycle(e.target.value)}
                />
              </div>
              <SubmitRow
                busy={busy}
                disabled={!/^\d{4}-\d{2}-\d{2}$/.test(cycle) || cycle === invoice.cycleAnchor}
                label="Save cycle"
                onCancel={() => setMode(null)}
                onSubmit={() => patch({ cycleAnchor: cycle })}
              />
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  tone,
  active,
  disabled,
  loading,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone?: "green" | "red";
  active?: boolean;
  disabled?: boolean;
  /** Immediate (no sub-form) action in flight — spinner replaces the icon. */
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50",
        active
          ? "border-primary/50 bg-primary/10 text-foreground"
          : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50",
        tone === "green" && !active && "hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-500/40",
        tone === "red" && !active && "hover:text-red-600 dark:hover:text-red-400 hover:border-red-500/40"
      )}
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Icon className="h-3 w-3" />}
      {label}
    </button>
  );
}

const NOTE_MAX = 500;

function NoteField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <textarea
        className={cn(FIELD, "resize-y")}
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={NOTE_MAX}
      />
      <p className="mt-0.5 text-right text-[10px] text-muted-foreground">
        {NOTE_MAX - value.length} characters left
      </p>
    </div>
  );
}

function SubmitRow({
  busy,
  disabled,
  label,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  disabled?: boolean;
  label: string;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/50 transition-colors disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSubmit}
        disabled={busy || disabled}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white shadow-sm ac-gradient hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
      >
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {label}
      </button>
    </div>
  );
}
