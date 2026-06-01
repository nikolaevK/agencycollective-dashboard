"use client";

import { useEffect, useRef, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import {
  X,
  Plus,
  Trash2,
  Send,
  Download,
  Eye,
  Loader2,
  Check,
  Paperclip,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { InvoicePdfDocument } from "@/components/invoice/pdf/InvoicePdfTemplate";
import {
  calculateTotals,
  createEmptyItem,
  formatCurrencyValue,
} from "@/lib/invoice/validation";
import type { InvoiceData, InvoiceItem, PaymentType } from "@/types/invoice";
import { buildAdAccountLineItems } from "@/lib/adAccountLineItem";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIELD =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20";
const LABEL =
  "text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block";

const ATTACH_MAX_COUNT = 5;
const ATTACH_MAX_BYTES = 3 * 1024 * 1024;
const ATTACH_MAX_TOTAL_BYTES = 3 * 1024 * 1024;
const ATTACH_BLOCKED_EXTS = new Set([
  "exe", "bat", "cmd", "com", "scr", "pif", "msi", "ps1", "vbs", "vbe",
  "js", "jse", "wsf", "wsh", "hta", "jar", "app", "deb", "rpm",
]);

// Ad-spend fee options: 2.0%–7.0% in 0.5% steps (basis points).
const FEE_OPTIONS: { bps: number; label: string }[] = [];
for (let bps = 200; bps <= 700; bps += 50) {
  FEE_OPTIONS.push({ bps, label: `${(bps / 100).toFixed(1)}%` });
}

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface AdAccountInvoiceTarget {
  id: string;
  accountName: string;
  vendor: string | null;
  adSpendFeeBps: number;
  monthlyRetainerCents: number;
  clientName: string | null;
  clientEmail: string | null;
}

interface Props {
  /** Attached ad account, or null for a free invoice. */
  adAccount: AdAccountInvoiceTarget | null;
  onClose: () => void;
  onSent: () => void;
}

export function AdAccountInvoiceDrawer({ adAccount, onClose, onSent }: Props) {
  const isFree = !adAccount;

  const [data, setData] = useState<InvoiceData | null>(null);
  const [paymentType, setPaymentType] = useState<PaymentType>("local");
  const [spendDollars, setSpendDollars] = useState("");
  const [feeBps, setFeeBps] = useState(adAccount?.adSpendFeeBps ?? 350);
  // Line-item context — drives the two canonical lines (retainer + ad-spend).
  const [accountName, setAccountName] = useState(adAccount?.accountName ?? "");
  const [vendor, setVendor] = useState(adAccount?.vendor ?? "");
  const [retainerDollars, setRetainerDollars] = useState(
    adAccount ? String(adAccount.monthlyRetainerCents / 100) : ""
  );

  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const [ccInput, setCcInput] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "preview" | "download" | "send">(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [savedOk, setSavedOk] = useState(true);

  const paymentReqRef = useRef(0);
  const readyRef = useRef(false);
  // Stable ids for the two canonical lines, so we can reconcile them against
  // any extra admin-added line items without churning keys or losing extras.
  const retainerIdRef = useRef<string | null>(null);
  const adSpendIdRef = useRef<string | null>(null);
  if (retainerIdRef.current === null) retainerIdRef.current = createEmptyItem().id;
  if (adSpendIdRef.current === null) adSpendIdRef.current = createEmptyItem().id;
  const providerRef = useRef<string>("Agency Collective");
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const retainerCents = Math.max(0, Math.round((Number(retainerDollars) || 0) * 100));
  const spendCents = Math.max(0, Math.round((Number(spendDollars) || 0) * 100));

  // The two canonical lines (retainer + ad-spend fee) for the current inputs.
  function makeCanonicalItems(): InvoiceItem[] {
    return buildAdAccountLineItems({
      retainerId: retainerIdRef.current!,
      adSpendId: adSpendIdRef.current!,
      accountName,
      vendor,
      monthlyRetainerCents: retainerCents,
      spendCents,
      feeBps,
      serviceProvider: providerRef.current,
    });
  }

  // Build the prefill query (only used for the shell: sender / payment / logo /
  // receiver / invoice number — line items are computed locally).
  function prefillUrl(pt: PaymentType): string {
    const p = new URLSearchParams();
    p.set("paymentType", pt);
    if (adAccount) p.set("adAccountId", adAccount.id);
    return `/api/admin/ad-accounts/invoice/prefill?${p.toString()}`;
  }

  // Initial load — sets the full invoice (receiver + line item).
  useEffect(() => {
    let active = true;
    fetch(prefillUrl("local"))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        if (!active) return;
        const d = json.data.invoiceData as InvoiceData;
        if (d.sender?.name) providerRef.current = d.sender.name;
        const t = new Date();
        const localToday = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
        // Own the line items locally (stable ids) from the start.
        const items = makeCanonicalItems();
        const { subTotal, totalAmount } = calculateTotals(items, null, null, null);
        setData({
          ...d,
          details: { ...d.details, invoiceDate: localToday, items, subTotal, totalAmount },
        });
        readyRef.current = true;
      })
      .catch(() => active && setError("Failed to load invoice."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recompute the canonical lines locally when spend / fee / retainer / context
  // changes — no network round-trip (no per-keystroke fetch storm). Canonical
  // lines (retainer + ad-spend, each present only when its amount > 0) are kept
  // at the front; any extra admin-added line items are preserved after them.
  useEffect(() => {
    if (!readyRef.current) return;
    const desired = makeCanonicalItems();
    setData((d) => {
      if (!d) return d;
      const extras = d.details.items.filter(
        (it) => it.id !== retainerIdRef.current && it.id !== adSpendIdRef.current
      );
      const items = [...desired, ...extras];
      const { subTotal, totalAmount } = calculateTotals(items, null, null, null);
      return { ...d, details: { ...d.details, items, subTotal, totalAmount } };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spendDollars, feeBps, accountName, vendor, retainerDollars]);

  function handleAddFiles(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    setAttachError(null);
    const incoming = Array.from(picked);
    const next: File[] = [...attachments];
    let runningTotal = next.reduce((s, f) => s + f.size, 0);
    for (const f of incoming) {
      if (next.length >= ATTACH_MAX_COUNT) {
        setAttachError(`Max ${ATTACH_MAX_COUNT} attachments.`);
        break;
      }
      const ext = fileExtension(f.name);
      if (ext && ATTACH_BLOCKED_EXTS.has(ext)) {
        setAttachError(`"${f.name}" — .${ext} files aren't allowed.`);
        continue;
      }
      if (f.size > ATTACH_MAX_BYTES) {
        setAttachError(`"${f.name}" exceeds ${formatBytes(ATTACH_MAX_BYTES)}.`);
        continue;
      }
      if (runningTotal + f.size > ATTACH_MAX_TOTAL_BYTES) {
        setAttachError(`Total attachments would exceed ${formatBytes(ATTACH_MAX_TOTAL_BYTES)}.`);
        break;
      }
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      next.push(f);
      runningTotal += f.size;
    }
    setAttachments(next);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }
  function removeAttachment(i: number) {
    setAttachments((prev) => prev.filter((_, idx) => idx !== i));
    setAttachError(null);
  }
  const attachTotal = attachments.reduce((s, f) => s + f.size, 0);

  function patchDetails(patch: Partial<InvoiceData["details"]>) {
    setData((d) => (d ? { ...d, details: { ...d.details, ...patch } } : d));
  }
  function patchReceiver(patch: Partial<InvoiceData["receiver"]>) {
    setData((d) => (d ? { ...d, receiver: { ...d.receiver, ...patch } } : d));
  }
  function setItems(items: InvoiceItem[]) {
    const { subTotal, totalAmount } = calculateTotals(items, null, null, null);
    patchDetails({ items, subTotal, totalAmount });
  }
  function updateItem(id: string, patch: Partial<InvoiceItem>) {
    if (!data) return;
    setItems(
      data.details.items.map((it) => {
        if (it.id !== id) return it;
        const next = { ...it, ...patch };
        next.total = (next.quantity || 0) * (next.unitPrice || 0);
        return next;
      })
    );
  }
  function addItem(item?: InvoiceItem) {
    if (!data) return;
    setItems([...data.details.items, item ?? createEmptyItem()]);
  }
  function removeItem(id: string) {
    if (!data) return;
    setItems(data.details.items.filter((it) => it.id !== id));
  }

  async function changePaymentType(next: PaymentType) {
    setPaymentType(next);
    const reqId = ++paymentReqRef.current;
    try {
      const res = await fetch(prefillUrl(next));
      if (!res.ok) return;
      const json = await res.json();
      if (!mounted.current || reqId !== paymentReqRef.current) return;
      patchDetails({ paymentInfo: (json.data.invoiceData as InvoiceData).details.paymentInfo });
    } catch {
      /* keep existing */
    }
  }

  function commitCc(raw: string) {
    const v = raw.trim().toLowerCase().replace(/[,;]+$/, "");
    if (!v) return;
    if (!EMAIL_RE.test(v)) {
      setError(`"${v}" is not a valid email`);
      return;
    }
    if (ccEmails.length >= 10) {
      setError("Maximum 10 CC recipients.");
      return;
    }
    if (!ccEmails.includes(v) && v !== data?.receiver.email.toLowerCase()) {
      setCcEmails((prev) => [...prev, v]);
    }
    setCcInput("");
  }

  async function buildPdfBlob(): Promise<Blob> {
    return pdf(<InvoicePdfDocument data={data!} />).toBlob();
  }

  async function handlePreview() {
    if (!data) return;
    setBusy("preview");
    try {
      const url = URL.createObjectURL(await buildPdfBlob());
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate PDF.");
    } finally {
      setBusy(null);
    }
  }
  async function handleDownload() {
    if (!data) return;
    setBusy("download");
    try {
      const url = URL.createObjectURL(await buildPdfBlob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${data.details.invoiceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate PDF.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSend() {
    if (!data) return;
    const email = data.receiver.email.trim();
    if (!EMAIL_RE.test(email)) {
      setError("A valid recipient email is required to send.");
      return;
    }
    if (data.details.items.length === 0) {
      setError("Add at least one line item.");
      return;
    }
    const finalCcs = [...ccEmails];
    const pending = ccInput.trim().toLowerCase().replace(/[,;]+$/, "");
    if (pending) {
      if (!EMAIL_RE.test(pending)) {
        setError(`"${pending}" is not a valid email`);
        return;
      }
      if (pending !== email.toLowerCase() && !finalCcs.includes(pending) && finalCcs.length < 10) {
        finalCcs.push(pending);
      }
    }

    setError(null);
    setBusy("send");
    try {
      const blob = await buildPdfBlob();
      const fd = new FormData();
      fd.set("email", email);
      fd.set("invoiceNumber", data.details.invoiceNumber);
      fd.set("amountCents", String(Math.max(0, Math.round((data.details.totalAmount ?? 0) * 100))));
      if (adAccount) fd.set("adAccountId", adAccount.id);
      // Components — the server derives the invoice type (retainer / ad_spend /
      // combined) and records the ad-spend detail from these.
      fd.set("retainerCents", String(retainerCents));
      fd.set("spendCents", String(spendCents));
      fd.set("feeBps", String(feeBps));
      // Brand/recipient hints for filing a free invoice's PDF.
      if (accountName) fd.set("brand", accountName);
      fd.set("recipientName", data.receiver.name);
      fd.set("pdf", new File([blob], `invoice-${data.details.invoiceNumber}.pdf`, { type: "application/pdf" }));
      for (const cc of finalCcs) fd.append("cc", cc);
      for (const file of attachments) fd.append("attachments", file);

      const res = await fetch("/api/admin/ad-accounts/invoice/send", {
        method: "POST",
        body: fd,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      // `saved` = PDF filed in Documents; `recorded` = tracking row written.
      // Either failing means the email went out but follow-up bookkeeping
      // didn't — keep the drawer open with the amber notice.
      const ok = j.saved !== false && j.recorded !== false;
      setSavedOk(ok);
      setSent(true);
      onSent();
      if (ok) setTimeout(onClose, 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send invoice.");
    } finally {
      setBusy(null);
    }
  }

  const currency = data?.details.currency ?? "USD";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="relative h-full w-full max-w-2xl overflow-y-auto bg-card shadow-xl border-l border-border/50"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/50 bg-card px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Ad account invoice</h2>
            <p className="text-xs text-muted-foreground">
              {isFree ? "No account attached" : adAccount!.accountName}
              {data ? ` · ${data.details.invoiceNumber}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 w-full animate-pulse rounded-lg bg-muted/60" />
            ))}
          </div>
        ) : !data ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-sm text-destructive">{error ?? "Failed to load invoice."}</p>
            <button
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Account context (free invoices type these in; attached accounts
                show them read-only since they come from the account). */}
            {isFree && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Account name</label>
                  <input
                    className={FIELD}
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="OT_AC_brand-CC"
                  />
                </div>
                <div>
                  <label className={LABEL}>Vendor</label>
                  <input
                    className={FIELD}
                    value={vendor}
                    onChange={(e) => setVendor(e.target.value)}
                    placeholder="ConceptSF"
                  />
                </div>
              </div>
            )}

            {/* Invoice components — retainer + ad-spend fee. A line appears on
                the invoice only when its amount is greater than zero. */}
            <div className="rounded-lg border border-border/50 p-3 space-y-3">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Invoice components
              </p>
              <div>
                <label className={LABEL}>Monthly retainer ($)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className={FIELD}
                  value={retainerDollars}
                  onChange={(e) => setRetainerDollars(e.target.value)}
                  placeholder="1500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:items-end">
                <div>
                  <label className={LABEL}>Ad spend ($)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className={FIELD}
                    value={spendDollars}
                    onChange={(e) => setSpendDollars(e.target.value)}
                    placeholder="41499.35"
                  />
                </div>
                <div>
                  <label className={LABEL}>Ad spend fee %</label>
                  <select
                    className={FIELD}
                    value={feeBps}
                    onChange={(e) => setFeeBps(Number(e.target.value))}
                  >
                    {FEE_OPTIONS.map((o) => (
                      <option key={o.bps} value={o.bps}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Leave retainer or ad spend at 0 to omit that line.
              </p>
            </div>

            {/* Recipient */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Bill to</label>
                <input
                  className={FIELD}
                  value={data.receiver.name}
                  onChange={(e) => patchReceiver({ name: e.target.value })}
                />
              </div>
              <div>
                <label className={LABEL}>Recipient email</label>
                <input
                  className={FIELD}
                  type="email"
                  value={data.receiver.email}
                  onChange={(e) => patchReceiver({ email: e.target.value })}
                  placeholder="client@company.com"
                />
              </div>
            </div>

            {/* CC */}
            <div>
              <label className={LABEL}>CC (optional)</label>
              <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-background px-2 py-1.5">
                {ccEmails.map((cc) => (
                  <span key={cc} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
                    {cc}
                    <button
                      type="button"
                      aria-label={`Remove ${cc}`}
                      onClick={() => setCcEmails((p) => p.filter((x) => x !== cc))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <input
                  className="flex-1 min-w-[140px] bg-transparent text-sm focus:outline-none py-0.5"
                  value={ccInput}
                  onChange={(e) => setCcInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      commitCc(ccInput);
                    }
                  }}
                  onBlur={() => commitCc(ccInput)}
                  placeholder={ccEmails.length === 0 ? "add CC email…" : ""}
                />
              </div>
            </div>

            {/* Attachments */}
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <label className={LABEL + " mb-0"}>Attachments (optional)</label>
                <span className="text-[11px] text-muted-foreground">
                  {attachments.length}/{ATTACH_MAX_COUNT} · {formatBytes(attachTotal)}/{formatBytes(ATTACH_MAX_TOTAL_BYTES)}
                </span>
              </div>
              <div className="rounded-lg border bg-background p-2 space-y-2">
                {attachments.length > 0 && (
                  <ul className="space-y-1.5">
                    {attachments.map((f, i) => (
                      <li key={`${f.name}-${f.size}-${i}`} className="flex items-center gap-2 rounded-md bg-muted px-2 py-1.5">
                        <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="flex-1 min-w-0 text-xs text-foreground truncate">{f.name}</span>
                        <span className="text-[11px] text-muted-foreground shrink-0">{formatBytes(f.size)}</span>
                        <button
                          type="button"
                          onClick={() => removeAttachment(i)}
                          aria-label={`Remove ${f.name}`}
                          className="p-0.5 rounded hover:bg-background/60 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={attachments.length >= ATTACH_MAX_COUNT}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted/50 transition-colors",
                      attachments.length >= ATTACH_MAX_COUNT && "opacity-50"
                    )}
                  >
                    <Plus className="h-3 w-3" />
                    Add file{attachments.length === 0 ? "s" : ""}
                  </button>
                </div>
                <input ref={fileInputRef} type="file" multiple onChange={(e) => handleAddFiles(e.target.files)} className="hidden" />
              </div>
              {attachError && <p className="mt-1.5 text-[11px] text-destructive">{attachError}</p>}
            </div>

            {/* Dates + payment type */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:items-end">
              <div>
                <label className={LABEL}>Invoice date</label>
                <input
                  type="date"
                  className={FIELD}
                  value={data.details.invoiceDate}
                  onChange={(e) => patchDetails({ invoiceDate: e.target.value })}
                />
              </div>
              <div>
                <label className={LABEL}>Due date</label>
                <input
                  type="date"
                  className={FIELD}
                  value={data.details.dueDate}
                  onChange={(e) => patchDetails({ dueDate: e.target.value })}
                />
              </div>
              <div>
                <label className={LABEL}>Payment</label>
                <div className="flex rounded-lg border bg-background p-0.5">
                  {(["local", "international"] as PaymentType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => changePaymentType(t)}
                      className={cn(
                        "flex-1 rounded-md px-2 py-1.5 text-xs font-semibold capitalize transition-colors",
                        paymentType === t
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Line items */}
            <div>
              <label className={LABEL}>Line items</label>
              <div className="space-y-2">
                {data.details.items.map((it) => (
                  <div key={it.id} className="rounded-lg border border-border/50 p-2 space-y-2">
                    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2">
                      <input
                        className="rounded-md bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="Item name"
                        value={it.name}
                        onChange={(e) => updateItem(it.id, { name: e.target.value })}
                      />
                      <input
                        type="number"
                        min={0}
                        className="w-16 rounded-md bg-background px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/20"
                        value={it.quantity}
                        onChange={(e) => updateItem(it.id, { quantity: Number(e.target.value) || 0 })}
                      />
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="w-28 rounded-md bg-background px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/20"
                        value={it.unitPrice}
                        onChange={(e) => updateItem(it.id, { unitPrice: Number(e.target.value) || 0 })}
                      />
                      <button
                        onClick={() => removeItem(it.id)}
                        className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                        aria-label="Remove item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <textarea
                      rows={4}
                      className="w-full rounded-md bg-background px-2 py-1.5 text-xs text-foreground/80 focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y"
                      placeholder="Description (optional)"
                      value={it.description}
                      onChange={(e) => updateItem(it.id, { description: e.target.value })}
                    />
                  </div>
                ))}
              </div>
              <button
                onClick={() => addItem()}
                className="mt-2 flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <Plus className="h-3.5 w-3.5" />
                Add item
              </button>
            </div>

            {/* Total */}
            <div className="flex items-center justify-between border-t border-border/50 pt-3">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-lg font-bold text-foreground">
                {formatCurrencyValue(data.details.totalAmount, currency)}
              </span>
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            {sent && (
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm",
                  savedOk
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                )}
              >
                <Check className="h-4 w-4" />
                {savedOk ? "Invoice sent and filed." : "Invoice emailed, but filing the copy failed."}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        {data && (
          <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border/50 bg-card px-5 py-3">
            <button
              onClick={handlePreview}
              disabled={busy !== null}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors disabled:opacity-50"
            >
              <Eye className="h-4 w-4" /> Preview
            </button>
            <button
              onClick={handleDownload}
              disabled={busy !== null}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> PDF
            </button>
            <button
              onClick={handleSend}
              disabled={busy !== null}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white shadow-sm ac-gradient hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
            >
              {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {busy === "send" ? "Sending…" : "Send invoice"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
