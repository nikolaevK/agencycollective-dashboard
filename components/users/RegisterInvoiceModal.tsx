"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Loader2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
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

const INPUT =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20";
const LABEL =
  "text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block";

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
  const { data: docs, isLoading: docsLoading } = useQuery({
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

  const invoiceDocs = docs?.invoices ?? [];

  // Prefill ONLY when the picked doc id changes — not on every render. A
  // background refetch of client-documents (60s stale) produces a fresh array
  // whose elements are new object references; depending on the doc object
  // directly would re-fire the effect and re-clobber any sentDate /
  // invoiceNumber edits the admin made after picking. Amount + email aren't
  // on the doc row, so we never touch them here.
  useEffect(() => {
    if (!selectedDocId) return;
    const doc = invoiceDocs.find((d) => d.id === selectedDocId);
    if (!doc) return;
    const num = invoiceNumberFromFilename(doc.fileName);
    if (num) setInvoiceNumber(num);
    const created = doc.createdAt?.slice(0, 10);
    if (created && /^\d{4}-\d{2}-\d{2}$/.test(created)) {
      setSentDate(created);
    }
    // invoiceDocs is intentionally excluded — see comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDocId]);

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
            recipientEmail: recipientEmail.trim() || undefined,
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
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-border/50 bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/50 bg-card px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-foreground">
              Register existing invoice
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              For invoices sent outside this UI — no email or PDF is generated.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Pick existing — optional */}
          <div>
            <label className={LABEL}>
              Pick from filed invoices <span className="font-normal lowercase text-muted-foreground/70">(optional)</span>
            </label>
            <div className="relative">
              <select
                value={selectedDocId}
                onChange={(e) => setSelectedDocId(e.target.value)}
                disabled={docsLoading}
                className={cn(INPUT, "appearance-none pr-8")}
              >
                <option value="">— none, enter manually —</option>
                {invoiceDocs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.fileName}
                    {d.createdAt ? ` · ${d.createdAt.slice(0, 10)}` : ""}
                  </option>
                ))}
              </select>
              <FileText className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
            {docsLoading && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Loading filed invoices…
              </p>
            )}
            {!docsLoading && invoiceDocs.length === 0 && (
              <p className="text-[11px] text-muted-foreground mt-1">
                No filed invoices for this client — enter the details manually.
              </p>
            )}
          </div>

          {/* Invoice number */}
          <div>
            <label className={LABEL}>Invoice number</label>
            <input
              type="text"
              className={INPUT}
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="INV-20260527-ABC"
              maxLength={100}
            />
          </div>

          {/* Cycle + amount */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Cycle (billing date)</label>
              <input
                type="date"
                className={INPUT}
                value={cycleAnchor}
                onChange={(e) => setCycleAnchor(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Which re-bill cycle this invoice pays.
              </p>
            </div>
            <div>
              <label className={LABEL}>Amount (USD)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                className={INPUT}
                value={amountDollars}
                onChange={(e) => setAmountDollars(e.target.value)}
                placeholder="0.00"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Display only — used in the panel.
              </p>
            </div>
          </div>

          {/* Sent date + recipient */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Sent date</label>
              <input
                type="date"
                className={INPUT}
                value={sentDate}
                onChange={(e) => setSentDate(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Decides the month group in the panel.
              </p>
            </div>
            <div>
              <label className={LABEL}>
                Recipient email <span className="font-normal lowercase text-muted-foreground/70">(optional)</span>
              </label>
              <input
                type="email"
                className={INPUT}
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="client@company.com"
                maxLength={254}
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
            Heads up: this records the invoice as already-sent — no email goes
            out, no PDF is generated. If the client has a current sent invoice,
            it will be superseded.
          </p>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border/50 bg-card px-5 py-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white shadow-sm ac-gradient hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitting ? "Registering…" : "Register as sent"}
          </button>
        </div>
      </div>
    </div>
  );
}
