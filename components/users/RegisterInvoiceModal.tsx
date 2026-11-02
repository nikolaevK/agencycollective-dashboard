"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Loader2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { badgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { dialogOverlayClass, dialogPanelClass } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PayoutDocument } from "@/lib/payoutDocuments";

interface DocumentsResponse {
  brand: string;
  invoices: PayoutDocument[];
  scopes: PayoutDocument[];
}

async function fetchDocuments(userId: string): Promise<DocumentsResponse> {
  const res = await fetch(`/api/admin/clients/${userId}/documents`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data as DocumentsResponse;
}

interface Props {
  userId: string;
  /** Defaults the cycle anchor — usually schedule.nextRebillAt. Falls back to today. */
  defaultCycleAnchor: string | null;
  /** Defaults the amount — usually payoutMrr (cents). */
  defaultAmountCents: number;
  /** Defaults the recipient email — usually the client's email. */
  defaultRecipientEmail: string | null;
  onClose: () => void;
  onRegistered: () => void;
}

// Radix SelectItem can't hold "" — the "none, enter manually" option maps to this.
const NONE = "__none__";
// Same check the register route applies — fail fast instead of a 400.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Returns today's local date as yyyy-mm-dd so the <input type="date"> default
 * matches the admin's wall clock. The server normalises to noon-UTC, so a
 * date picked here always lands in the right month regardless of timezone.
 */
function todayYmd(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

/**
 * Extract the invoice number from a `payout_documents` filename. Files are
 * stored as `invoice-{INV-…}.pdf` (see the send route), so stripping that
 * pattern gives the number back. Falls back to "" if the filename doesn't
 * match — the admin can still type one in.
 */
function invoiceNumberFromFilename(filename: string): string {
  const m = filename.match(/^invoice-(.+)\.pdf$/i);
  return m ? m[1] : "";
}

export function RegisterInvoiceModal({
  userId,
  defaultCycleAnchor,
  defaultAmountCents,
  defaultRecipientEmail,
  onClose,
  onRegistered,
}: Props) {
  const queryClient = useQueryClient();

  // Same query key as the Documents tab — deduped if both are open.
  const {
    data: docs,
    isLoading: docsLoading,
    isError: docsError,
    isFetching: docsFetching,
    refetch: refetchDocs,
  } = useQuery({
    queryKey: ["client-documents", userId],
    queryFn: () => fetchDocuments(userId),
    staleTime: 60_000,
  });

  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
  const [cycleAnchor, setCycleAnchor] = useState<string>(
    defaultCycleAnchor ?? todayYmd()
  );
  const [amountDollars, setAmountDollars] = useState<string>(
    defaultAmountCents > 0 ? (defaultAmountCents / 100).toFixed(2) : ""
  );
  const [sentDate, setSentDate] = useState<string>(todayYmd());
  const [recipientEmail, setRecipientEmail] = useState<string>(
    defaultRecipientEmail ?? ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What the currently-picked doc wrote into the form (null = nothing).
  const [autoFilled, setAutoFilled] = useState<{
    invoiceNumber: string | null;
    sentDate: string | null;
  }>({ invoiceNumber: null, sentDate: null });

  const invoiceDocs = docs?.invoices ?? [];

  // Never close mid-submit (the request would finish against a dead modal).
  function requestClose() {
    if (!submitting) onClose();
  }
  // Stays registered while submitting so the Escape is swallowed here rather
  // than falling through to whatever layer sits below.
  useEscapeKey(requestClose);

  // Prefill ONLY on an explicit pick — never on a background refetch of
  // client-documents (60s stale), which would re-clobber edits made after
  // picking. Re-picking (or "— none —") first reverts what the previous doc
  // filled in, unless the admin has edited that field since. Amount + email
  // aren't on the doc row, so we never touch them here.
  function pickDoc(id: string) {
    setSelectedDocId(id);
    let num =
      autoFilled.invoiceNumber !== null && invoiceNumber === autoFilled.invoiceNumber
        ? ""
        : invoiceNumber;
    let sent =
      autoFilled.sentDate !== null && sentDate === autoFilled.sentDate
        ? todayYmd()
        : sentDate;
    const filled: typeof autoFilled = { invoiceNumber: null, sentDate: null };
    const doc = id ? invoiceDocs.find((d) => d.id === id) : undefined;
    if (doc) {
      const fromName = invoiceNumberFromFilename(doc.fileName);
      if (fromName) {
        num = fromName;
        filled.invoiceNumber = fromName;
      }
      // The admin's LOCAL calendar day of the filing (createdAt is a zone-less
      // SQLite UTC stamp — taking its date part read an evening-PT filing as
      // the next day/month). Mark it UTC before converting.
      const rawCreated = doc.createdAt ?? "";
      const createdDate = rawCreated
        ? new Date(
            /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(rawCreated) &&
            !/[zZ]|[+-]\d{2}:?\d{2}$/.test(rawCreated)
              ? rawCreated.replace(" ", "T") + "Z"
              : rawCreated
          )
        : null;
      const created =
        createdDate && !isNaN(createdDate.getTime())
          ? `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, "0")}-${String(createdDate.getDate()).padStart(2, "0")}`
          : null;
      if (created && /^\d{4}-\d{2}-\d{2}$/.test(created)) {
        sent = created;
        filled.sentDate = created;
      }
    }
    setInvoiceNumber(num);
    setSentDate(sent);
    setAutoFilled(filled);
  }

  async function handleSubmit() {
    const numTrim = invoiceNumber.trim();
    if (!numTrim) {
      setError("Invoice number is required.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cycleAnchor)) {
      setError("Pick a valid cycle date.");
      return;
    }
    const amountFloat = Number(amountDollars);
    if (amountDollars && (!Number.isFinite(amountFloat) || amountFloat < 0)) {
      setError("Amount must be a non-negative number.");
      return;
    }
    if (sentDate && !/^\d{4}-\d{2}-\d{2}$/.test(sentDate)) {
      setError("Sent date is invalid.");
      return;
    }
    const emailTrim = recipientEmail.trim();
    if (emailTrim && (!EMAIL_RE.test(emailTrim) || emailTrim.length > 254)) {
      setError("Recipient email is not a valid address.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/clients/${userId}/rebill-invoices/register`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoiceNumber: numTrim,
            cycleAnchor,
            amountCents: amountDollars
              ? Math.round(amountFloat * 100)
              : 0,
            sentAt: sentDate || undefined,
            recipientEmail: emailTrim || undefined,
            payoutDocumentId: selectedDocId || undefined,
          }),
        }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      // Same fan-out as the send drawer + mark-unpaid — every surface that
      // shows the invoice_sent state needs to recompute.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["client-billing", userId] }),
        queryClient.invalidateQueries({ queryKey: ["admin-sent-invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-rebill-alerts"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
      ]);
      onRegistered();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to register invoice.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={requestClose}
    >
      <div className={dialogOverlayClass} aria-hidden />
      <div
        className={cn(dialogPanelClass, "relative z-50 flex w-full max-w-lg max-h-[90vh] flex-col overflow-hidden")}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="register-invoice-title"
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b px-6 py-4">
          <div className="min-w-0 space-y-1">
            <h2 id="register-invoice-title" className="text-base font-medium leading-snug">
              Register existing invoice
            </h2>
            <p className="text-sm text-muted-foreground">
              For invoices sent outside this UI — no email or PDF is generated.
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

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-5">
          {/* Pick existing — optional */}
          <div className="grid gap-2">
            <Label htmlFor="register-invoice-doc">
              <FileText className="size-3.5 text-muted-foreground" />
              <span>
                Pick from filed invoices <span className="font-normal text-muted-foreground">(optional)</span>
              </span>
            </Label>
            <Select
              value={selectedDocId || NONE}
              onValueChange={(v) => pickDoc(v === NONE ? "" : v)}
              disabled={docsLoading}
            >
              <SelectTrigger id="register-invoice-doc">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— none, enter manually —</SelectItem>
                {invoiceDocs.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.fileName}
                    {d.createdAt ? ` · ${d.createdAt.slice(0, 10)}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {docsLoading && (
              <p className="text-xs text-muted-foreground">
                Loading filed invoices…
              </p>
            )}
            {docsError && !docs ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-destructive">
                Couldn&rsquo;t load filed invoices.
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => refetchDocs()}
                  disabled={docsFetching}
                >
                  {docsFetching ? "Retrying…" : "Retry"}
                </Button>
              </div>
            ) : (
              !docsLoading &&
              invoiceDocs.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No filed invoices for this client — enter the details manually.
                </p>
              )
            )}
          </div>

          {/* Invoice number */}
          <div className="grid gap-2">
            <Label htmlFor="register-invoice-number">Invoice number</Label>
            <Input
              id="register-invoice-number"
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="INV-20260527-ABC"
              maxLength={100}
            />
          </div>

          {/* Cycle + amount */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="grid content-start gap-2">
              <Label htmlFor="register-invoice-cycle">Cycle (billing date)</Label>
              <DatePicker
                id="register-invoice-cycle"
                value={cycleAnchor}
                onValueChange={setCycleAnchor}
              />
              <p className="text-xs text-muted-foreground">
                Which re-bill cycle this invoice pays.
              </p>
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="register-invoice-amount">Amount (USD)</Label>
              <Input
                id="register-invoice-amount"
                type="number"
                min={0}
                step="0.01"
                value={amountDollars}
                onChange={(e) => setAmountDollars(e.target.value)}
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground">
                Display only — used in the panel.
              </p>
            </div>
          </div>

          {/* Sent date + recipient */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="grid content-start gap-2">
              <Label htmlFor="register-invoice-sent">Sent date</Label>
              <DatePicker
                id="register-invoice-sent"
                value={sentDate}
                onValueChange={setSentDate}
              />
              <p className="text-xs text-muted-foreground">
                Decides the month group in the panel.
              </p>
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="register-invoice-email">
                Recipient email <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="register-invoice-email"
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="client@company.com"
                maxLength={254}
              />
            </div>
          </div>

          {error && (
            <div className={cn("rounded-2xl border px-4 py-3 text-sm", badgeTone.danger)}>
              {error}
            </div>
          )}

          <p className="rounded-2xl bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
            Heads up: this records the invoice as already-sent — no email goes
            out, no PDF is generated. If the client has a current sent invoice,
            it will be superseded.
          </p>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={requestClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? <Loader2 className="animate-spin" /> : null}
            {submitting ? "Registering…" : "Register as sent"}
          </Button>
        </div>
      </div>
    </div>
  );
}
