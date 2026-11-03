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
import { badgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { dialogOverlayClass, dialogPanelClass } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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

// Radix SelectItem can't hold "" — the default (no style) option maps to this.
const DEFAULT_STYLE = "__default__";

const LOG_CHANNELS: { value: Exclude<FollowUpChannel, "email">; label: string }[] = [
  { value: "call", label: "Call" },
  { value: "message", label: "Message (text, Slack, WhatsApp…)" },
  { value: "note", label: "Other / note" },
];

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
        "text-xs",
        quiet ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground",
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
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      title="Send a reminder (re-attaches the original PDF) or log a call/message"
      className={cn("h-9 shrink-0 text-xs sm:h-8", className)}
    >
      <BellRing />
      Follow up
    </Button>
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
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      onClick={(e) => {
        // Rendered inside other drawers — don't let the click close them too.
        e.stopPropagation();
        requestClose();
      }}
    >
      <div className={dialogOverlayClass} aria-hidden />
      <div
        className={cn(dialogPanelClass, "relative z-50 flex w-full max-w-lg max-h-[90dvh] flex-col overflow-hidden")}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="follow-up-title"
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b px-6 py-4">
          <div className="min-w-0 space-y-1">
            <h2 id="follow-up-title" className="truncate text-base font-medium leading-snug">
              Follow up · {subjectName}
            </h2>
            <p className="text-sm text-muted-foreground">
              {invoice.invoiceNumber}
              {invoice.amountCents > 0 && ` · ${formatCentsExact(invoice.amountCents)}`}
              {" · "}sent {formatDate(invoice.sentAt)} · cycle {formatDate(invoice.cycleAnchor)}
              {invoice.status === "unpaid" && " · marked unpaid"}
            </p>
            <p className="text-xs text-muted-foreground">
              The original invoice stays as sent — this doesn&rsquo;t create or replace an invoice.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={requestClose}
            disabled={submitting}
            aria-label="Close"
            className="shrink-0 bg-secondary"
          >
            <X />
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-5">
          {readOnly && (
            <p className="rounded-2xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
              This invoice is {invoice.status} — follow-ups are closed. Its history is kept below.
            </p>
          )}
          {!readOnly && (
            <>
              {/* Mode switch */}
              <ToggleGroup
                type="single"
                variant="outline"
                value={mode}
                onValueChange={(v) => {
                  // Re-clicking the active mode still clears the messages.
                  setMode((v || mode) as "email" | "log");
                  setError(null);
                  setSuccess(null);
                }}
                className="grid w-full grid-cols-2"
              >
                {(
                  [
                    ["email", "Email reminder", Mail],
                    ["log", "Log a follow-up", StickyNote],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <ToggleGroupItem key={value} value={value} className="w-full">
                    <Icon />
                    {label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>

              {mode === "email" ? (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="follow-up-to">To</Label>
                    <Input
                      id="follow-up-to"
                      type="email"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      placeholder="client@example.com"
                      disabled={submitting}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="follow-up-cc">CC</Label>
                    <CcChipsInput field={cc} exclude={[to]} id="follow-up-cc" disabled={submitting} />
                    {(invoice.ccEmails?.length ?? 0) > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Pre-filled with the original invoice&rsquo;s CCs.
                      </p>
                    )}
                  </div>
                  {/* Also shown when the original style was deleted — even if no
                      profiles remain — so the admin can pick the default. */}
                  {(profiles.length > 0 || originalStyleMissing) && (
                    <div className="grid gap-2">
                      <Label htmlFor="follow-up-style">Email style</Label>
                      <Select
                        value={styleId ?? DEFAULT_STYLE}
                        disabled={submitting}
                        onValueChange={(v) => {
                          setStyleId(v === DEFAULT_STYLE ? null : v);
                          setStyleTouched(true);
                        }}
                      >
                        <SelectTrigger id="follow-up-style">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {originalStyleMissing && styleId !== null && (
                            <SelectItem value={styleId} disabled>
                              Original style (deleted) — choose another
                            </SelectItem>
                          )}
                          <SelectItem value={DEFAULT_STYLE}>Agency Collective (default)</SelectItem>
                          {profiles.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {originalStyleMissing && (
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          The style this invoice was sent with no longer exists — choose one.
                        </p>
                      )}
                    </div>
                  )}
                  <div className="grid gap-2">
                    <Label htmlFor="follow-up-message">
                      Personal note{" "}
                      <span className="font-normal text-muted-foreground">(optional)</span>
                    </Label>
                    <Textarea
                      id="follow-up-message"
                      className="resize-y"
                      rows={4}
                      maxLength={FOLLOW_UP_MESSAGE_MAX}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Added to the standard reminder, e.g. “Let us know if you need the invoice re-issued to a different entity.”"
                      disabled={submitting}
                    />
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Checkbox
                      id="follow-up-attach-pdf"
                      className="mt-0.5"
                      checked={hasPdf && attachPdf}
                      disabled={!hasPdf || submitting}
                      onCheckedChange={(v) => setAttachPdf(v === true)}
                    />
                    <div className="grid gap-1">
                      <Label
                        htmlFor="follow-up-attach-pdf"
                        className={cn("gap-1.5 leading-snug", !hasPdf && "text-muted-foreground")}
                      >
                        <Paperclip className="size-3.5" />
                        Attach the original invoice PDF
                      </Label>
                      {!hasPdf && (
                        <p className="text-xs text-muted-foreground">
                          No PDF is on file for this invoice — the reminder references its number and amount.
                        </p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid gap-3">
                    <Label id="follow-up-channel-label">How did you follow up?</Label>
                    <RadioGroup
                      id="follow-up-channel"
                      aria-labelledby="follow-up-channel-label"
                      value={logChannel}
                      disabled={submitting}
                      onValueChange={(v) =>
                        setLogChannel(v as Exclude<FollowUpChannel, "email">)
                      }
                    >
                      {LOG_CHANNELS.map((c) => (
                        <div key={c.value} className="flex items-center gap-2.5">
                          <RadioGroupItem value={c.value} id={`follow-up-channel-${c.value}`} />
                          <Label htmlFor={`follow-up-channel-${c.value}`} className="font-normal">
                            {c.label}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="follow-up-note">Note</Label>
                    <Textarea
                      id="follow-up-note"
                      className="resize-y"
                      rows={4}
                      maxLength={FOLLOW_UP_MESSAGE_MAX}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="e.g. Spoke with Sam — payment goes out Friday via wire."
                      disabled={submitting}
                    />
                    <p className="text-xs text-muted-foreground">
                      Logged only — nothing is sent to the client.
                    </p>
                  </div>
                </>
              )}

              {error && (
                <div className={cn("rounded-2xl border px-4 py-3 text-sm", badgeTone.danger)}>
                  {error}
                </div>
              )}
              {success && (
                <div className={cn("flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm", badgeTone.success)}>
                  <CheckCircle2 className="size-4 shrink-0" />
                  {success}
                </div>
              )}
            </>
          )}

          {/* History */}
          <div className={cn("space-y-3", !readOnly && "border-t pt-4")}>
            <p className="text-sm font-medium">History</p>
            {historyLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : historyError && !history ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-destructive">
                Couldn&rsquo;t load the follow-up history.
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => refetchHistory()}
                  disabled={historyFetching}
                >
                  <RotateCw />
                  Retry
                </Button>
              </div>
            ) : (
              <ol>
                {(history ?? []).map((f) => {
                  const meta = CHANNEL_META[f.channel] ?? CHANNEL_META.note;
                  const Icon = meta.icon;
                  return (
                    <li key={f.id} className="relative flex gap-3 pb-4">
                      {/* Timeline connector down to the next entry. */}
                      <span aria-hidden className="absolute bottom-0 left-3 top-7 w-px bg-border" />
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Icon className="size-3.5 text-muted-foreground" />
                      </span>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="text-sm font-medium leading-5 text-foreground">
                          {meta.label}
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            {formatDate(f.createdAt)}
                            {f.createdByName ? ` · ${f.createdByName}` : ""}
                          </span>
                        </p>
                        {f.channel === "email" && (
                          <p className="break-words text-xs text-muted-foreground">
                            to {f.recipientEmail}
                            {f.ccEmails.length > 0 && ` · cc ${f.ccEmails.join(", ")}`}
                            {f.attachedPdf ? " · PDF attached" : " · no attachment"}
                          </p>
                        )}
                        {f.message && (
                          <p className="mt-1 whitespace-pre-wrap break-words rounded-2xl bg-muted/50 px-3 py-2 text-sm text-foreground/90">
                            {f.message}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
                <li className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed">
                    <Send className="size-3.5 text-muted-foreground" />
                  </span>
                  <p className="pt-0.5 text-sm leading-5 text-muted-foreground">
                    <span className="font-medium text-foreground">Invoice sent</span>{" "}
                    {formatDate(invoice.sentAt)}
                    {invoice.recipientEmail ? ` to ${invoice.recipientEmail}` : ""}
                  </p>
                </li>
              </ol>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={requestClose}
            disabled={submitting}
          >
            Close
          </Button>
          {!readOnly && (
            <Button
              type="button"
              onClick={submit}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="animate-spin" />
              ) : mode === "email" ? (
                <Mail />
              ) : (
                <StickyNote />
              )}
              {mode === "email"
                ? submitting
                  ? "Sending…"
                  : "Send reminder"
                : submitting
                ? "Saving…"
                : "Log follow-up"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
