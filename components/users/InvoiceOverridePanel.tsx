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
import { badgeTone, badgeToneHover, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/use-confirm";

// Radix Select items can't carry an empty value — "no payout" maps to this.
const NONE = "__none__";

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
          <Link2 className="size-3" />
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
        <Lock className="size-3" />
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
    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
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
  const { confirm, dialog } = useConfirm();
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
      <Button
        type="button"
        variant="ghost"
        size="xs"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          setMode(null);
          setError(null);
        }}
        // The negative margin lines the label up with the row's text; a
        // taller hit area on phones.
        className="-mx-2.5 h-8 text-muted-foreground sm:h-6"
      >
        Manage
        <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
      </Button>

      {open && isSuperseded && (
        <p className="mt-2 text-xs text-muted-foreground">
          Superseded — a newer invoice replaced this one. It keeps its record but can no
          longer change status; manage the newer invoice instead.
        </p>
      )}

      {open && !isSuperseded && (
        <div className="mt-2 space-y-3 rounded-2xl bg-muted/50 p-3">
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
                onClick={async () => {
                  if (
                    !(await confirm({
                      title: `Reopen ${invoice.invoiceNumber} as awaiting payment?`,
                      description: "It stays locked from auto-matching until you Resync.",
                      confirmText: "Reopen",
                    }))
                  )
                    return;
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
                onClick={async () => {
                  if (
                    !(await confirm({
                      title: `Unlink the payout from ${invoice.invoiceNumber}?`,
                      description: "The invoice stays paid (by hand) — only the payout reference is removed.",
                      confirmText: "Unlink",
                    }))
                  )
                    return;
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
                onClick={async () => {
                  if (
                    !(await confirm({
                      title: `Hand ${invoice.invoiceNumber} back to the automation?`,
                      description:
                        "Manual markers and the note are cleared, the invoice returns to awaiting, and the Payout DB decides again whether it's paid.",
                      confirmText: "Resync",
                      destructive: true,
                    }))
                  )
                    return;
                  patch({ resync: true }, "resync");
                }}
              />
            )}
          </div>

          {(mode === "paid" || mode === "link") && (
            <div className="space-y-2">
              {payoutOptionsUrl && (
                <div className="grid gap-2">
                  <Label>
                    {mode === "link" ? "Payout to link" : "Link to a payout (optional)"}
                  </Label>
                  {payouts === null ? (
                    <Skeleton className="h-9 w-full rounded-3xl" />
                  ) : (
                    <Select
                      value={payoutId || NONE}
                      onValueChange={(v) => setPayoutId(v === NONE ? "" : v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      {/* Long payout labels wrap instead of running off a phone screen. */}
                      <SelectContent className="max-w-[calc(100vw-2rem)] [&_[role=option]]:whitespace-normal">
                        <SelectItem value={NONE}>
                          {mode === "link" ? "Choose a payout…" : "No payout — mark paid by hand"}
                        </SelectItem>
                        {payouts.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {monthLabel(p.payoutYear, p.payoutMonth)} · {p.brandName} ·{" "}
                            {formatCentsExact(p.amountPaid || p.amountDue)}
                            {p.salesRep ? ` · ${p.salesRep}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {payoutsError ? (
                    <p className="flex items-center gap-2 text-xs text-destructive">
                      Couldn&rsquo;t load payout rows.
                      <Button
                        type="button"
                        variant="link"
                        size="xs"
                        onClick={() => {
                          // Back to null re-runs the lazy loader above.
                          setPayoutsError(false);
                          setPayouts(null);
                        }}
                        className="h-auto px-0 text-destructive underline"
                      >
                        Retry
                      </Button>
                    </p>
                  ) : (
                    payouts !== null &&
                    payouts.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No payout rows found for this brand.
                      </p>
                    )
                  )}
                  <p className="text-xs text-muted-foreground">
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
              <p className="text-xs text-muted-foreground">
                {invoice.status === "paid"
                  ? "Records that this cycle went unpaid. A cycle settled by hand stops counting as paid, so the next bill date can move back and the row may show as due/overdue again."
                  : "Records that this cycle went unpaid. The next bill date does not move."}
              </p>
              {schedulePaid && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
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
              <p className="text-xs text-muted-foreground">
                Which billing cycle this invoice covers.{" "}
                {currentCycle ? (
                  isOnCurrentCycle ? (
                    <>It is on the current cycle ({formatDate(currentCycle)}).</>
                  ) : (
                    <>The current cycle is {formatDate(currentCycle)} — align to it for the &ldquo;Invoice sent&rdquo; status.</>
                  )
                ) : null}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {cycleChoices.length > 0 && (
                  <Select
                    value={cycleChoices.some((c) => c.date === cycle) ? cycle : ""}
                    onValueChange={(v) => v && setCycle(v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pick a cycle… (or pick a date)" />
                    </SelectTrigger>
                    <SelectContent>
                      {cycleChoices.map((c) => (
                        <SelectItem key={c.date} value={c.date}>
                          {formatDate(c.date)}
                          {c.offset === 0 ? " (current)" : c.offset < 0 ? " (previous)" : " (future)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <DatePicker
                  value={cycle}
                  onValueChange={setCycle}
                  aria-label="Billing cycle date"
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
            <div className={cn("rounded-2xl border px-3 py-2 text-xs", badgeTone.danger)}>{error}</div>
          )}
        </div>
      )}
      {dialog}
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
  // green/red actions get a subtle status tint: on hover, and while their
  // sub-form is open.
  const badge: BadgeTone | null = tone === "green" ? "success" : tone === "red" ? "danger" : null;
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "text-muted-foreground",
        badge ? badgeToneHover[badge] : "hover:text-foreground",
        active && (badge ? badgeTone[badge] : "bg-muted text-foreground dark:bg-muted")
      )}
    >
      {loading ? <Loader2 className="animate-spin" /> : <Icon />}
      {label}
    </Button>
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
    <div className="grid gap-1">
      <Textarea
        className="resize-y"
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={NOTE_MAX}
      />
      <p className="text-right text-xs text-muted-foreground tabular-nums">
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
      <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
      <Button type="button" size="sm" onClick={onSubmit} disabled={busy || disabled}>
        {busy && <Loader2 className="animate-spin" />}
        {label}
      </Button>
    </div>
  );
}
