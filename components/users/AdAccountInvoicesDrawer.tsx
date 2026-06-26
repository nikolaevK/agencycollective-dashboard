"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  X,
  Loader2,
  FileText,
  XCircle,
  Plus,
  Paperclip,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney, formatDate } from "./format";
import type { AdInvoiceType } from "@/lib/adAccountLineItem";

const FIELD =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20";
const LABEL =
  "text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block leading-tight";

type InvoiceStatus = "sent" | "paid" | "unpaid" | "superseded";

interface AccountInvoice {
  id: string;
  invoiceNumber: string;
  invoiceType: AdInvoiceType;
  cycleAnchor: string;
  amountCents: number;
  recipientEmail: string | null;
  payoutDocumentId: string | null;
  sentAt: string;
  status: InvoiceStatus;
}

const STATUS_STYLES: Record<InvoiceStatus, { label: string; cls: string }> = {
  sent: { label: "Awaiting", cls: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  paid: { label: "Paid", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  unpaid: { label: "Unpaid", cls: "bg-red-500/10 text-red-600 dark:text-red-400" },
  superseded: { label: "Superseded", cls: "bg-slate-500/10 text-slate-600 dark:text-slate-400" },
};

function typeLabel(t: AdInvoiceType): string {
  return t === "combined" ? "Retainer + ad spend" : t === "ad_spend" ? "Ad spend fee" : "Retainer";
}

function todayYmd(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

async function fetchInvoices(accountId: string): Promise<AccountInvoice[]> {
  const res = await fetch(`/api/admin/ad-accounts/${accountId}/invoices`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data.invoices as AccountInvoice[];
}

interface Props {
  accountId: string;
  accountName: string;
  defaultCycleAnchor: string | null;
  defaultRecipientEmail: string | null;
  defaultRetainerCents: number;
  onClose: () => void;
  onChanged: () => void;
}

export function AdAccountInvoicesDrawer({
  accountId,
  accountName,
  defaultCycleAnchor,
  defaultRecipientEmail,
  defaultRetainerCents,
  onClose,
  onChanged,
}: Props) {
  const queryClient = useQueryClient();
  const { data: invoices = [], isLoading, isError } = useQuery({
    queryKey: ["admin-ad-account-invoices", accountId],
    queryFn: () => fetchInvoices(accountId),
    staleTime: 30_000,
  });

  const [showRegister, setShowRegister] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function refreshAll() {
    queryClient.invalidateQueries({ queryKey: ["admin-ad-account-invoices", accountId] });
    queryClient.invalidateQueries({ queryKey: ["admin-ad-accounts"] });
    queryClient.invalidateQueries({ queryKey: ["admin-ad-account-sent-invoices"] });
    onChanged();
  }

  async function handleMarkUnpaid(inv: AccountInvoice) {
    if (!confirm(`Mark invoice ${inv.invoiceNumber} as unpaid?`)) return;
    setBusyId(inv.id);
    try {
      const res = await fetch(`/api/admin/ad-accounts/invoices/${inv.id}/mark-unpaid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      refreshAll();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to mark unpaid.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="relative h-full w-full max-w-xl overflow-y-auto bg-card shadow-xl border-l border-border/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/50 bg-card px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-foreground truncate">Invoices</h2>
            <p className="text-xs text-muted-foreground truncate">{accountName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">
              History
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {invoices.length} invoice{invoices.length !== 1 ? "s" : ""}
              </span>
            </p>
            <button
              onClick={() => setShowRegister((s) => !s)}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted/50 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Register backdated
            </button>
          </div>

          {showRegister && (
            <RegisterForm
              accountId={accountId}
              defaultCycleAnchor={defaultCycleAnchor}
              defaultRecipientEmail={defaultRecipientEmail}
              defaultRetainerCents={defaultRetainerCents}
              onDone={() => {
                setShowRegister(false);
                refreshAll();
              }}
              onCancel={() => setShowRegister(false)}
            />
          )}

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-16 w-full animate-pulse rounded-lg bg-muted/60" />
              ))}
            </div>
          ) : isError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Failed to load invoices.
            </div>
          ) : invoices.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No invoices yet for this ad account.
            </p>
          ) : (
            <ul className="space-y-2">
              {invoices.map((inv) => {
                const s = STATUS_STYLES[inv.status];
                return (
                  <li
                    key={inv.id}
                    className="rounded-lg border border-border/50 p-3 flex items-center justify-between gap-3 flex-wrap"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {inv.invoiceNumber}
                        </p>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            s.cls
                          )}
                        >
                          {s.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {typeLabel(inv.invoiceType)} · sent {formatDate(inv.sentAt)} · cycle{" "}
                        {formatDate(inv.cycleAnchor)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {inv.amountCents > 0 && (
                        <span className="text-sm font-semibold text-foreground">
                          {formatMoney(inv.amountCents)}
                        </span>
                      )}
                      {inv.payoutDocumentId && (
                        <a
                          href={`/api/admin/ad-accounts/invoices/${inv.id}/document`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="View stored PDF"
                          className="flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                        >
                          <FileText className="h-3 w-3" />
                          PDF
                        </a>
                      )}
                      {inv.status === "sent" && (
                        <button
                          onClick={() => handleMarkUnpaid(inv)}
                          disabled={busyId === inv.id}
                          title="Mark unpaid"
                          className="flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:border-red-500/40 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                        >
                          {busyId === inv.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <XCircle className="h-3 w-3" />
                          )}
                          Unpaid
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function RegisterForm({
  accountId,
  defaultCycleAnchor,
  defaultRecipientEmail,
  defaultRetainerCents,
  onDone,
  onCancel,
}: {
  accountId: string;
  defaultCycleAnchor: string | null;
  defaultRecipientEmail: string | null;
  defaultRetainerCents: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [cycleAnchor, setCycleAnchor] = useState(defaultCycleAnchor ?? todayYmd());
  const [sentDate, setSentDate] = useState(todayYmd());
  const [amountDollars, setAmountDollars] = useState(
    defaultRetainerCents > 0 ? (defaultRetainerCents / 100).toFixed(2) : ""
  );
  const [invoiceType, setInvoiceType] = useState<AdInvoiceType>("retainer");
  const [recipientEmail, setRecipientEmail] = useState(defaultRecipientEmail ?? "");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!invoiceNumber.trim()) {
      setError("Invoice number is required.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cycleAnchor)) {
      setError("Pick a valid cycle date.");
      return;
    }
    const amount = Number(amountDollars);
    if (amountDollars && (!Number.isFinite(amount) || amount < 0)) {
      setError("Amount must be a non-negative number.");
      return;
    }
    if (file && file.size > 10 * 1024 * 1024) {
      setError("PDF too large (max 10 MB).");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("invoiceNumber", invoiceNumber.trim());
      fd.set("cycleAnchor", cycleAnchor);
      if (sentDate) fd.set("sentAt", sentDate);
      fd.set("amountCents", String(amountDollars ? Math.round(amount * 100) : 0));
      fd.set("invoiceType", invoiceType);
      if (recipientEmail.trim()) fd.set("recipientEmail", recipientEmail.trim());
      if (file) fd.set("pdf", file);

      const res = await fetch(`/api/admin/ad-accounts/${accountId}/invoices/register`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to register invoice.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/[0.03] p-3 space-y-3">
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
        Register backdated invoice
      </p>
      <div>
        <label className={LABEL}>Invoice number</label>
        <input
          className={FIELD}
          value={invoiceNumber}
          onChange={(e) => setInvoiceNumber(e.target.value)}
          placeholder="INV-20260301-ABC"
          maxLength={100}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:items-end">
        <div className="flex flex-col">
          <label className={LABEL}>Sent date</label>
          <input
            type="date"
            className={FIELD}
            value={sentDate}
            onChange={(e) => setSentDate(e.target.value)}
          />
        </div>
        <div className="flex flex-col">
          <label className={LABEL}>Cycle (billing date)</label>
          <input
            type="date"
            className={FIELD}
            value={cycleAnchor}
            onChange={(e) => setCycleAnchor(e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:items-end">
        <div className="flex flex-col">
          <label className={LABEL}>Amount (USD)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            className={FIELD}
            value={amountDollars}
            onChange={(e) => setAmountDollars(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="flex flex-col">
          <label className={LABEL}>Type</label>
          <select
            className={FIELD}
            value={invoiceType}
            onChange={(e) => setInvoiceType(e.target.value as AdInvoiceType)}
          >
            <option value="retainer">Retainer</option>
            <option value="ad_spend">Ad spend fee</option>
            <option value="combined">Retainer + ad spend</option>
          </select>
        </div>
      </div>
      <div>
        <label className={LABEL}>Recipient email (optional)</label>
        <input
          type="email"
          className={FIELD}
          value={recipientEmail}
          onChange={(e) => setRecipientEmail(e.target.value)}
          placeholder="client@company.com"
          maxLength={254}
        />
      </div>
      <div>
        <label className={LABEL}>Invoice PDF (optional)</label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted/50 transition-colors"
          >
            <Paperclip className="h-3.5 w-3.5" />
            {file ? "Change PDF" : "Upload PDF"}
          </button>
          {file && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
              <span className="truncate">{file.name}</span>
              <button onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }}>
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="hidden"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={submitting}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/50 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={submitting}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white shadow-sm ac-gradient hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
        >
          {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {submitting ? "Saving…" : "Register"}
        </button>
      </div>
    </div>
  );
}
