"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  X,
  Loader2,
  Mail,
  Phone,
  MessageSquare,
  StickyNote,
  Paperclip,
  Send,
  CheckCircle2,
  BellRing,
  RotateCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCentsExact } from "@/lib/format";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { CcChipsInput, useCcField } from "@/components/invoice/CcChipsInput";
import { isValidEmail } from "@/lib/invoice/email";
import type { AgencyProfileRecord } from "@/lib/invoiceAgencyProfiles";
import {
  FOLLOW_UP_MESSAGE_MAX,
  canFollowUp,
  daysSince,
  type FollowUpChannel,
  type FollowUpSummary,
  type InvoiceFollowUp,
} from "@/lib/invoiceFollowUpRules";
import { formatDate } from "./format";

const FIELD =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20";
const LABEL =
  "text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block";

/** The slice of a sent invoice (client re-bill OR ad-account) a follow-up needs. */
export interface FollowUpInvoice {
  id: string;
  invoiceNumber: string;
  amountCents: number;
  sentAt: string;
  cycleAnchor: string;
  status: string;
  recipientEmail: string | null;
  payoutDocumentId: string | null;
  /** Original send's CCs + style — absent on rows that don't carry them. */
  ccEmails?: string[];
  styleProfileId?: string | null;
}

const CHANNEL_META: Record<
  FollowUpChannel,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  email: { label: "Reminder emailed", icon: Mail },
  call: { label: "Call", icon: Phone },
  message: { label: "Message", icon: MessageSquare },
  note: { label: "Note", icon: StickyNote },
};

function agoLabel(iso: string | null): string {
  const d = daysSince(iso);
  if (d === null) return "—";
  if (d === 0) return "today";
  return d === 1 ? "1 day ago" : `${d} days ago`;
}

/** Days without any touch (send or follow-up) before a row is flagged. */
const QUIET_DAYS = 7;

/**
 * One-line chase status for a sent invoice: the latest follow-up, or how long
 * it has gone without one. Rendered on every surface that lists sent invoices
 * so "who needs a nudge" is visible without opening anything — amber once a
 * week passes with no touch.
 */
export function FollowUpSummaryText({
  sentAt,
  summary,
  className,
}: {
  sentAt: string;
  summary?: FollowUpSummary | null;
  className?: string;
}) {
  const count = summary?.count ?? 0;
  const lastTouch = count > 0 ? summary?.lastAt ?? null : sentAt;
  const quiet = (daysSince(lastTouch) ?? 0) >= QUIET_DAYS;
  const sinceSent = daysSince(sentAt) ?? 0;
  return (
    <p
      className={cn(
        "text-[11px]",
        quiet ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground",
        className
      )}
    >
      {count === 0 ? (
        <>
          No follow-up yet
          {sinceSent > 0 && ` · ${sinceSent} day${sinceSent !== 1 ? "s" : ""} since sent`}
        </>
      ) : (
        <>
          {count} follow-up{count !== 1 ? "s" : ""} · last {agoLabel(summary?.lastAt ?? null)}
          {summary?.lastChannel ? ` (${summary.lastChannel})` : ""}
        </>
      )}
    </p>
  );
}

/** Compact "Follow up" trigger shared by every sent-invoice list. */
export function FollowUpButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Send a reminder (re-attaches the original PDF) or log a call/message"
      className={cn(
        "flex h-9 items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-violet-500/40 hover:bg-violet-500/10 hover:text-violet-600 dark:hover:text-violet-400 shrink-0 sm:h-auto",
        className
      )}
    >
      <BellRing className="h-3 w-3" />
      Follow up
    </button>
  );
}

async function fetchFollowUps(endpoint: string): Promise<InvoiceFollowUp[]> {
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return (json.data?.followUps as InvoiceFollowUp[]) ?? [];
}

interface Props {
  invoice: FollowUpInvoice;
  /** Who is being chased — client or ad-account name, for the header. */
  subjectName: string;
  /** This invoice's /follow-ups endpoint (GET history, POST a follow-up). */
  endpoint: string;
  /** Recipient fallback when the invoice has none on file (client email). */
  fallbackEmail?: string | null;
  onClose: () => void;
  /** Fired after a follow-up is recorded — refresh the lists that show it. */
  onRecorded: () => void;
}

/**
 * Follow up on a sent invoice WITHOUT re-sending it: email a reminder that
 * re-attaches the PDF filed at send time, or log a call/message/note. The
 * invoice keeps its number, amount, sent date, cycle and status — nothing is
 * superseded — and every touch lands in the history below.
 */
export function InvoiceFollowUpDialog({
  invoice,
  subjectName,
  endpoint,
  fallbackEmail,
  onClose,
  onRecorded,
}: Props) {
  const queryClient = useQueryClient();
  const historyKey = ["invoice-follow-ups", endpoint];
  const {
    data: history,
    isLoading: historyLoading,
    isError: historyError,
    isFetching: historyFetching,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: historyKey,
    queryFn: () => fetchFollowUps(endpoint),
    staleTime: 30_000,
  });

  // Same key as the drawers' InvoiceStyleSelect — shared cache.
  const { data: profiles = [], isSuccess: profilesLoaded } = useQuery<AgencyProfileRecord[]>({
    queryKey: ["invoice-agency-profiles"],
    queryFn: async () => {
      const res = await fetch("/api/admin/invoice-agency-profiles");
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 60_000,
    retry: false,
  });

  const [mode, setMode] = useState<"email" | "log">("email");
  const [to, setTo] = useState(invoice.recipientEmail ?? fallbackEmail ?? "");
  const cc = useCcField();
  const [message, setMessage] = useState("");
  const hasPdf = invoice.payoutDocumentId != null;
  const [attachPdf, setAttachPdf] = useState(hasPdf);
  const originalStyle = invoice.styleProfileId ?? null;
  const [styleId, setStyleId] = useState<string | null>(originalStyle);
  const [styleTouched, setStyleTouched] = useState(false);
  const [logChannel, setLogChannel] = useState<Exclude<FollowUpChannel, "email">>("call");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Seed the CC chips with the original send's list (once).
  const { setEmails: seedCc } = cc;
  const originalCcKey = (invoice.ccEmails ?? []).join(",");
  useEffect(() => {
    seedCc(invoice.ccEmails ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalCcKey, seedCc]);

  // Paid / superseded invoices: history stays viewable, composing is closed.
  const readOnly = !canFollowUp(invoice.status);

  function requestClose() {
    if (!submitting) onClose();
  }
  useEscapeKey(requestClose);

  // A stored style that no longer exists can't be reproduced — the admin
  // must choose (the server refuses rather than silently re-branding). Only
  // decided once the list actually loaded (a failed load proves nothing).
  const originalStyleMissing =
    originalStyle !== null &&
    profilesLoaded &&
    !profiles.some((p) => p.id === originalStyle) &&
    !styleTouched;

  async function submit() {
    setError(null);
    setSuccess(null);
    let body: Record<string, unknown>;
    if (mode === "email") {
      const recipient = to.trim();
      if (!isValidEmail(recipient)) {
        setError("Enter a valid recipient email.");
        return;
      }
      const ccList = cc.finalize([recipient]);
      if (ccList === null) return;
      if (originalStyleMissing) {
        setError("The original invoice style no longer exists — pick a style first.");
        return;
      }
      body = {
        channel: "email",
        recipientEmail: recipient,
        cc: ccList,
        message: message.trim() || null,
        attachPdf: hasPdf && attachPdf,
        // Only override the original send's branding when changed here.
        ...(styleTouched ? { styleProfileId: styleId } : {}),
      };
    } else {
      if (!note.trim()) {
        setError("Add a short note about the follow-up.");
        return;
      }
      body = { channel: logChannel, message: note.trim() };
    }

    setSubmitting(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      if (mode === "email") {
        setMessage("");
        setSuccess(`Reminder sent to ${to.trim()}.`);
      } else {
        setNote("");
        setSuccess("Follow-up logged.");
      }
      queryClient.invalidateQueries({ queryKey: historyKey });
      onRecorded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Follow-up failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        // Rendered inside other drawers — don't let the click close them too.
        e.stopPropagation();
        requestClose();
      }}
    >
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-border/50 bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="follow-up-title"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border/50 bg-card px-5 py-4">
          <div className="min-w-0">
            <h2 id="follow-up-title" className="text-base font-bold text-foreground truncate">
              Follow up · {subjectName}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {invoice.invoiceNumber}
              {invoice.amountCents > 0 && ` · ${formatCentsExact(invoice.amountCents)}`}
              {" · "}sent {formatDate(invoice.sentAt)} · cycle {formatDate(invoice.cycleAnchor)}
              {invoice.status === "unpaid" && " · marked unpaid"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              The original invoice stays as sent — this doesn&rsquo;t create or replace an invoice.
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={submitting}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors disabled:opacity-50 shrink-0"
            aria-label="Close"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {readOnly && (
            <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              This invoice is {invoice.status} — follow-ups are closed. Its history is kept below.
            </p>
          )}
          {!readOnly && (
            <>
              {/* Mode switch */}
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-1" role="tablist">
                {(
                  [
                    ["email", "Email reminder", Mail],
                    ["log", "Log a follow-up", StickyNote],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={mode === value}
                    onClick={() => {
                      setMode(value);
                      setError(null);
                      setSuccess(null);
                    }}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                      mode === value
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              {mode === "email" ? (
                <>
                  <div>
                    <label className={LABEL} htmlFor="follow-up-to">
                      To
                    </label>
                    <input
                      id="follow-up-to"
                      type="email"
                      className={FIELD}
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      placeholder="client@example.com"
                      disabled={submitting}
                    />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="follow-up-cc">
                      CC
                    </label>
                    <CcChipsInput field={cc} exclude={[to]} id="follow-up-cc" disabled={submitting} />
                    {(invoice.ccEmails?.length ?? 0) > 0 && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Pre-filled with the original invoice&rsquo;s CCs.
                      </p>
                    )}
                  </div>
                  {/* Also shown when the original style was deleted — even if no
                      profiles remain — so the admin can pick the default. */}
                  {(profiles.length > 0 || originalStyleMissing) && (
                    <div>
                      <label className={LABEL} htmlFor="follow-up-style">
                        Email style
                      </label>
                      <select
                        id="follow-up-style"
                        className={FIELD}
                        value={styleId ?? ""}
                        disabled={submitting}
                        onChange={(e) => {
                          setStyleId(e.target.value || null);
                          setStyleTouched(true);
                        }}
                      >
                        {originalStyleMissing && styleId !== null && (
                          <option value={styleId} disabled>
                            Original style (deleted) — choose another
                          </option>
                        )}
                        <option value="">Agency Collective (default)</option>
                        {profiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      {originalStyleMissing && (
                        <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                          The style this invoice was sent with no longer exists — choose one.
                        </p>
                      )}
                    </div>
                  )}
                  <div>
                    <label className={LABEL} htmlFor="follow-up-message">
                      Personal note{" "}
                      <span className="font-normal lowercase text-muted-foreground/70">(optional)</span>
                    </label>
                    <textarea
                      id="follow-up-message"
                      className={cn(FIELD, "resize-y")}
                      rows={4}
                      maxLength={FOLLOW_UP_MESSAGE_MAX}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Added to the standard reminder, e.g. “Let us know if you need the invoice re-issued to a different entity.”"
                      disabled={submitting}
                    />
                  </div>
                  <label
                    className={cn(
                      "flex items-start gap-2 text-sm",
                      hasPdf ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={hasPdf && attachPdf}
                      disabled={!hasPdf || submitting}
                      onChange={(e) => setAttachPdf(e.target.checked)}
                    />
                    <span>
                      <span className="inline-flex items-center gap-1 font-medium">
                        <Paperclip className="h-3.5 w-3.5" />
                        Attach the original invoice PDF
                      </span>
                      {!hasPdf && (
                        <span className="block text-[11px]">
                          No PDF is on file for this invoice — the reminder references its number and amount.
                        </span>
                      )}
                    </span>
                  </label>
                </>
              ) : (
                <>
                  <div>
                    <label className={LABEL} htmlFor="follow-up-channel">
                      How did you follow up?
                    </label>
                    <select
                      id="follow-up-channel"
                      className={FIELD}
                      value={logChannel}
                      disabled={submitting}
                      onChange={(e) =>
                        setLogChannel(e.target.value as Exclude<FollowUpChannel, "email">)
                      }
                    >
                      <option value="call">Call</option>
                      <option value="message">Message (text, Slack, WhatsApp…)</option>
                      <option value="note">Other / note</option>
                    </select>
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="follow-up-note">
                      Note
                    </label>
                    <textarea
                      id="follow-up-note"
                      className={cn(FIELD, "resize-y")}
                      rows={4}
                      maxLength={FOLLOW_UP_MESSAGE_MAX}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="e.g. Spoke with Sam — payment goes out Friday via wire."
                      disabled={submitting}
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Logged only — nothing is sent to the client.
                    </p>
                  </div>
                </>
              )}

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </div>
              )}
              {success && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  {success}
                </div>
              )}
            </>
          )}

          {/* History */}
          <div className={cn(!readOnly && "border-t border-border/50 pt-4")}>
            <p className={LABEL}>History</p>
            {historyLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-10 w-full animate-pulse rounded-lg bg-muted/60" />
                ))}
              </div>
            ) : historyError && !history ? (
              <p className="flex items-center gap-2 text-[11px] text-red-600 dark:text-red-400">
                Couldn&rsquo;t load the follow-up history.
                <button
                  type="button"
                  onClick={() => refetchHistory()}
                  disabled={historyFetching}
                  className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:text-foreground disabled:opacity-50"
                >
                  <RotateCw className="h-3 w-3" />
                  Retry
                </button>
              </p>
            ) : (
              <ol className="space-y-2">
                {(history ?? []).map((f) => {
                  const meta = CHANNEL_META[f.channel] ?? CHANNEL_META.note;
                  const Icon = meta.icon;
                  return (
                    <li key={f.id} className="flex gap-2.5 rounded-lg border border-border/50 px-3 py-2">
                      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-foreground">
                          {meta.label}
                          <span className="ml-1.5 font-normal text-muted-foreground">
                            {formatDate(f.createdAt)}
                            {f.createdByName ? ` · ${f.createdByName}` : ""}
                          </span>
                        </p>
                        {f.channel === "email" && (
                          <p className="text-[11px] text-muted-foreground break-words">
                            to {f.recipientEmail}
                            {f.ccEmails.length > 0 && ` · cc ${f.ccEmails.join(", ")}`}
                            {f.attachedPdf ? " · PDF attached" : " · no attachment"}
                          </p>
                        )}
                        {f.message && (
                          <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-foreground/90">
                            {f.message}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
                <li className="flex gap-2.5 rounded-lg border border-dashed border-border/60 px-3 py-2">
                  <Send className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">Invoice sent</span>{" "}
                    {formatDate(invoice.sentAt)}
                    {invoice.recipientEmail ? ` to ${invoice.recipientEmail}` : ""}
                  </p>
                </li>
              </ol>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border/50 bg-card px-5 py-3">
          <button
            type="button"
            onClick={requestClose}
            disabled={submitting}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            Close
          </button>
          {!readOnly && (
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white shadow-sm ac-gradient hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === "email" ? (
                <Mail className="h-4 w-4" />
              ) : (
                <StickyNote className="h-4 w-4" />
              )}
              {mode === "email"
                ? submitting
                  ? "Sending…"
                  : "Send reminder"
                : submitting
                ? "Saving…"
                : "Log follow-up"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
