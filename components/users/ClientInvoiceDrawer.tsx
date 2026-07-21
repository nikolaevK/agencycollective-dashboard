"use client";

import { useEffect, useState, useRef } from "react";
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
import { InvoiceServiceSelector } from "@/components/invoice/InvoiceServiceSelector";
import {
  InvoiceStyleSelect,
  profilePaymentBlock,
} from "@/components/invoice/InvoiceStyleSelect";
import {
  calculateTotals,
  createEmptyItem,
  formatCurrencyValue,
} from "@/lib/invoice/validation";
import type { AgencyProfileRecord } from "@/lib/invoiceAgencyProfiles";
import type {
  InvoiceData,
  InvoiceItem,
  InvoiceSender,
  PaymentInfo,
  PaymentType,
} from "@/types/invoice";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIELD =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20";

// Mirror the route's limits (tuned for Vercel Pro's 4.5 MB request body cap)
// so the user gets immediate feedback before the upload happens. Server is
// authoritative — these are UX, not security.
const ATTACH_MAX_COUNT = 5;
const ATTACH_MAX_BYTES = 3 * 1024 * 1024; // 3 MB per file
const ATTACH_MAX_TOTAL_BYTES = 3 * 1024 * 1024; // 3 MB total
const ATTACH_BLOCKED_EXTS = new Set([
  "exe", "bat", "cmd", "com", "scr", "pif", "msi", "ps1", "vbs", "vbe",
  "js", "jse", "wsf", "wsh", "hta", "jar", "app", "deb", "rpm",
]);

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

interface Props {
  userId: string;
  clientName: string;
  onClose: () => void;
  onSent: () => void;
}

async function fetchPrefill(
  userId: string,
  paymentType: PaymentType
): Promise<{ invoiceData: InvoiceData; brand: string }> {
  const res = await fetch(
    `/api/admin/clients/${userId}/invoice/prefill?paymentType=${paymentType}`
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data;
}

export function ClientInvoiceDrawer({ userId, clientName, onClose, onSent }: Props) {
  const [data, setData] = useState<InvoiceData | null>(null);
  const [paymentType, setPaymentType] = useState<PaymentType>("local");
  // Invoice style — null = default Agency Collective, otherwise a saved
  // agency profile (e.g. PepAds) whose shell is applied to the PDF.
  const [styleProfile, setStyleProfile] = useState<AgencyProfileRecord | null>(null);
  // Default AC shell + payment blocks captured from the prefill, so switching
  // back from a profile restores them without guessing.
  const defaultStyleRef = useRef<{
    sender: InvoiceSender;
    logo: string;
    themeColor: string;
  } | null>(null);
  const defaultPaymentRef = useRef<Partial<Record<PaymentType, PaymentInfo>>>({});
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
  const paymentReq = useRef(0);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  // Add files from the picker. We APPEND (never replace) so repeated clicks
  // build up the list, and we reset the input value after so picking the same
  // file again — e.g. after removing it — still fires the onChange.
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
        setAttachError(
          `Total attachments would exceed ${formatBytes(ATTACH_MAX_TOTAL_BYTES)}.`
        );
        break;
      }
      // De-dupe by (name, size) — picking the same file twice in one open
      // shouldn't double it. Different files with the same name + size will
      // collide here too, but that's a very rare collision for a small list.
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

  // Initial prefill.
  useEffect(() => {
    let active = true;
    fetchPrefill(userId, "local")
      .then((d) => {
        if (!active) return;
        defaultStyleRef.current = {
          sender: d.invoiceData.sender,
          logo: d.invoiceData.details.invoiceLogo,
          themeColor: d.invoiceData.details.themeColor,
        };
        if (d.invoiceData.details.paymentInfo) {
          defaultPaymentRef.current.local = d.invoiceData.details.paymentInfo;
        }
        // Server runs in UTC; default the invoice date to the admin's LOCAL
        // date so an evening send doesn't print tomorrow's date.
        const t = new Date();
        const localToday = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
        setData({
          ...d.invoiceData,
          details: { ...d.invoiceData.details, invoiceDate: localToday },
        });
      })
      .catch(() => active && setError("Failed to load invoice."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [userId]);

  // --- mutations on the in-memory invoice -----------------------------------
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

  // Switch the invoice shell (sender / logo / theme / payment block) between
  // the default Agency Collective identity and a saved agency profile.
  // Recipient, dates and line items are untouched; email sending is unchanged.
  async function applyStyle(profile: AgencyProfileRecord | null) {
    setStyleProfile(profile);
    // Invalidate any in-flight payment-block fetch so it can't overwrite us.
    const reqId = ++paymentReq.current;
    if (profile) {
      const block = profilePaymentBlock(profile, paymentType);
      setData((d) =>
        d
          ? {
              ...d,
              sender: { ...profile.sender, customInputs: d.sender.customInputs },
              details: {
                ...d.details,
                invoiceLogo: profile.logo || d.details.invoiceLogo,
                themeColor: profile.themeColor || d.details.themeColor,
                // A blank profile template keeps the current block (mirrors
                // the Invoice page's applyProfile).
                ...(block ? { paymentInfo: block } : {}),
              },
            }
          : d
      );
      return;
    }
    const defaults = defaultStyleRef.current;
    if (!defaults) return;
    const cached = defaultPaymentRef.current[paymentType];
    setData((d) =>
      d
        ? {
            ...d,
            sender: { ...defaults.sender, customInputs: d.sender.customInputs },
            details: {
              ...d.details,
              invoiceLogo: defaults.logo,
              themeColor: defaults.themeColor,
              ...(cached ? { paymentInfo: cached } : {}),
            },
          }
        : d
    );
    if (!cached) {
      // The default block for this payment type was never fetched (the drawer
      // only prefetches local) — pull it now.
      try {
        const d = await fetchPrefill(userId, paymentType);
        if (!mounted.current || reqId !== paymentReq.current) return;
        const block = d.invoiceData.details.paymentInfo;
        if (block) {
          defaultPaymentRef.current[paymentType] = block;
          patchDetails({ paymentInfo: block });
        }
      } catch {
        /* keep existing payment info */
      }
    }
  }

  // Switching payment type re-pulls just the payment-instructions block,
  // preserving the admin's line-item / recipient edits. Under a profile style
  // the block comes from the profile's template instead.
  async function changePaymentType(next: PaymentType) {
    setPaymentType(next);
    const reqId = ++paymentReq.current;
    if (styleProfile) {
      const block = profilePaymentBlock(styleProfile, next);
      if (block) patchDetails({ paymentInfo: block });
      return;
    }
    try {
      const d = await fetchPrefill(userId, next);
      if (!mounted.current || reqId !== paymentReq.current) return; // unmounted, or a newer toggle won
      if (d.invoiceData.details.paymentInfo) {
        defaultPaymentRef.current[next] = d.invoiceData.details.paymentInfo;
      }
      patchDetails({ paymentInfo: d.invoiceData.details.paymentInfo });
    } catch {
      /* keep existing payment info */
    }
  }

  // CC chip handling.
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
      setError("A valid client email is required to send.");
      return;
    }
    if (data.details.items.length === 0) {
      setError("Add at least one line item.");
      return;
    }

    // Flush a typed-but-not-committed CC so it isn't dropped (the click handler
    // closes over the pre-blur ccEmails, so we read ccInput directly here).
    const finalCcs = [...ccEmails];
    const pending = ccInput.trim().toLowerCase().replace(/[,;]+$/, "");
    if (pending) {
      if (!EMAIL_RE.test(pending)) {
        setError(`"${pending}" is not a valid email`);
        return;
      }
      if (
        pending !== email.toLowerCase() &&
        !finalCcs.includes(pending) &&
        finalCcs.length < 10
      ) {
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
      // Amount in cents — feeds the client_rebill_invoices record so the Sent
      // Invoices panel can show the total without re-parsing the PDF. Server
      // re-validates and clamps.
      fd.set(
        "amountCents",
        String(Math.max(0, Math.round((data.details.totalAmount ?? 0) * 100)))
      );
      fd.set("pdf", new File([blob], `invoice-${data.details.invoiceNumber}.pdf`, { type: "application/pdf" }));
      // Brand the email like the PDF (subject/body/sign-off) — the server
      // resolves the profile itself; only the id crosses the wire.
      if (styleProfile) fd.set("styleProfileId", styleProfile.id);
      for (const cc of finalCcs) fd.append("cc", cc);
      // Additional email attachments (transient — not filed in Documents).
      // Server re-validates count/size/extension; this is just the wire format.
      for (const file of attachments) fd.append("attachments", file);
      const res = await fetch(`/api/admin/clients/${userId}/invoice/send`, {
        method: "POST",
        body: fd,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const ok = j.saved !== false;
      setSavedOk(ok);
      setSent(true);
      onSent();
      // Keep the drawer open if filing the copy failed so the amber notice is
      // seen; otherwise auto-close.
      if (ok) setTimeout(onClose, 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send invoice.");
    } finally {
      setBusy(null);
    }
  }

  const currency = data?.details.currency ?? "USD";

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="relative h-full w-full max-w-2xl overflow-y-auto bg-card shadow-xl border-l border-border/50"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/50 bg-card px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Re-bill invoice</h2>
            <p className="text-xs text-muted-foreground">
              {clientName}
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
            {/* Recipient */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Bill to
                </label>
                <input
                  className={FIELD}
                  value={data.receiver.name}
                  onChange={(e) => patchReceiver({ name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Client email
                </label>
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
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                CC (optional)
              </label>
              <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-background px-2 py-1.5">
                {ccEmails.map((cc) => (
                  <span
                    key={cc}
                    className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs"
                  >
                    {cc}
                    <button onClick={() => setCcEmails((p) => p.filter((x) => x !== cc))}>
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

            {/* Attachments (optional) — included with the email alongside the
                invoice PDF. Not filed in the client's Documents tab; transient
                send-time additions. Same limits as the server. */}
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Attachments (optional)
                </label>
                <span className="text-[11px] text-muted-foreground">
                  {attachments.length}/{ATTACH_MAX_COUNT} · {formatBytes(attachTotal)}/
                  {formatBytes(ATTACH_MAX_TOTAL_BYTES)}
                </span>
              </div>
              <div className="rounded-lg border bg-background p-2 space-y-2">
                {attachments.length > 0 && (
                  <ul className="space-y-1.5">
                    {attachments.map((f, i) => (
                      <li
                        key={`${f.name}-${f.size}-${i}`}
                        className="flex items-center gap-2 rounded-md bg-muted px-2 py-1.5"
                      >
                        <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="flex-1 min-w-0 text-xs text-foreground truncate">
                          {f.name}
                        </span>
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {formatBytes(f.size)}
                        </span>
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
                  {attachments.length === 0 && (
                    <span className="text-[11px] text-muted-foreground">
                      Max {ATTACH_MAX_COUNT} files, {formatBytes(ATTACH_MAX_BYTES)} each.
                      No .exe/.js/etc.
                    </span>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={(e) => handleAddFiles(e.target.files)}
                  className="hidden"
                />
              </div>
              {attachError && (
                <p className="mt-1.5 text-[11px] text-destructive">{attachError}</p>
              )}
            </div>

            {/* Invoice style — default AC or a saved agency profile (e.g. PepAds) */}
            <InvoiceStyleSelect
              selectedId={styleProfile?.id ?? null}
              onSelect={applyStyle}
              paymentType={paymentType}
            />

            {/* Dates + payment type */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Invoice date
                </label>
                <input
                  type="date"
                  className={FIELD}
                  value={data.details.invoiceDate}
                  onChange={(e) => patchDetails({ invoiceDate: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Due date
                </label>
                <input
                  type="date"
                  className={FIELD}
                  value={data.details.dueDate}
                  onChange={(e) => patchDetails({ dueDate: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Payment
                </label>
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
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Line items
                </label>
                <InvoiceServiceSelector onSelect={(item) => addItem(item)} align="right" />
              </div>
              <div className="space-y-2">
                {data.details.items.map((it) => (
                  <div
                    key={it.id}
                    className="rounded-lg border border-border/50 p-2 space-y-2"
                  >
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
                      rows={2}
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
                {savedOk
                  ? "Invoice sent and filed."
                  : "Invoice emailed, but filing the copy failed."}
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
              {busy === "send" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {busy === "send" ? "Sending…" : "Send invoice"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
