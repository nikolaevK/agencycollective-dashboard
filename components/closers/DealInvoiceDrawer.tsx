"use client";

import { useState, useEffect, useRef, lazy, Suspense, type ReactNode } from "react";
import { X, Download, Eye, Send, Loader2, Save, AlertTriangle, Plus, Trash2, FileCheck, FileSignature, ExternalLink, Pencil, RefreshCw, RotateCw } from "lucide-react";
import { pdf } from "@react-pdf/renderer";
import { useQueryClient } from "@tanstack/react-query";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useDealInvoice } from "@/hooks/useDealInvoice";
import { useDealContract } from "@/hooks/useDealContract";
import { useAdditionalInvoices, type AdditionalInvoiceRecord } from "@/hooks/useAdditionalInvoices";
import { useAdditionalContracts } from "@/hooks/useAdditionalContracts";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { InvoicePdfDocument } from "@/components/invoice/pdf/InvoicePdfTemplate";
import { InvoiceDrawerShell } from "@/components/invoice/InvoiceDrawerShell";
import { InvoicePreviewDialog } from "@/components/invoice/InvoicePreviewDialog";
import { InvoiceTotalsSummary } from "@/components/invoice/InvoiceTotalsSummary";
import { LineItemsEditor } from "@/components/invoice/LineItemsEditor";
import { CcChipsInput, useCcField } from "@/components/invoice/CcChipsInput";
import { DiscountField } from "@/components/invoice/InvoiceChargesForm";
import { InvoiceNotesFields } from "@/components/invoice/InvoiceNotesFields";
import { calculateTotals, formatCurrencyValue } from "@/lib/invoice/validation";
import { isValidEmail } from "@/lib/invoice/email";
import type { DiscountDetails, InvoiceData, InvoiceItem, PaymentInfo, PaymentType } from "@/types/invoice";
import { loadPaymentInfoFromConfig, emptyPaymentInfo } from "@/lib/invoice/paymentUtils";
import { cn } from "@/lib/utils";

const DocusealBuilder = lazy(() =>
  import("@docuseal/react").then((mod) => ({ default: mod.DocusealBuilder }))
);

interface Props {
  dealId: string | null;
  dealValue: number; // cents
  dealPaymentType?: string;
  dealNotes?: string | null;
  onClose: () => void;
}

const INPUT_CLS =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-base sm:text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow";
const LABEL_CLS = "mb-1 block text-xs font-medium text-muted-foreground";

// The closer's address is CC'd on top of the deal's up-to-10 additional CCs
// (see UnifiedDealForm), so a deal invoice can carry 11 — the send route
// accepts the same.
const DEAL_MAX_CC = 11;

function loadPaymentTemplate(config: Record<string, string>, type: PaymentType): PaymentInfo {
  return loadPaymentInfoFromConfig(config, type) ?? emptyPaymentInfo(type);
}

/** Totals for the drawer — the SAME engine the Invoice page, PDF and other
 *  drawers use. (This used to re-derive subtotal-only, silently dropping any
 *  discount / tax / shipping already on the invoice data.) */
function withTotals(data: InvoiceData): InvoiceData {
  const { subTotal, totalAmount } = calculateTotals(
    data.details.items,
    data.details.discountDetails,
    data.details.taxDetails,
    data.details.shippingDetails
  );
  return { ...data, details: { ...data.details, subTotal, totalAmount } };
}

/** The address an invoice is sent to is the one its "Bill to" block prints. */
function withRecipientEmail(data: InvoiceData, email: string): InvoiceData {
  const v = email.trim();
  if (data.receiver.email === v) return data;
  return { ...data, receiver: { ...data.receiver, email: v } };
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-border/60 bg-background/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wide text-foreground">{title}</h4>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function DealInvoiceDrawer({ dealId, dealValue, dealPaymentType, dealNotes, onClose }: Props) {
  const queryClient = useQueryClient();
  const { data: invoice, isLoading } = useDealInvoice(dealId);
  const { data: contract } = useDealContract(dealId);
  const { data: additionalInvoices = [] } = useAdditionalInvoices(dealId);
  const { data: additionalContracts = [] } = useAdditionalContracts(dealId);
  const hasPendingContract = contract?.status === "pending";
  const sendableAdditionalContracts = additionalContracts.filter(
    (c) => c.status !== "signed" && !!c.contractTemplateId
  );
  const canSendPrimaryContract = !!contract && contract.status !== "signed" && !!contract.contractTemplateId;
  const totalSendableContracts =
    (canSendPrimaryContract ? 1 : 0) + sendableAdditionalContracts.length;
  const canSendContract = totalSendableContracts > 0;
  const isSent = invoice?.status === "sent";
  const [invoiceData, setInvoiceDataRaw] = useState<InvoiceData | null>(null);
  const [addlData, setAddlData] = useState<Map<string, InvoiceData>>(new Map());
  const [activeInvoiceId, setActiveInvoiceId] = useState<string | null>(null);
  const primaryDataRef = useRef<InvoiceData | null>(null);
  const [addingInvoice, setAddingInvoice] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [addingContract, setAddingContract] = useState(false);
  const [deletingContractId, setDeletingContractId] = useState<string | null>(null);
  // Which contract's preview/edit overlay is open, keyed by "primary" or an additional contract id
  const [previewingContractKey, setPreviewingContractKey] = useState<string | null>(null);
  // Which contract's template dropdown is open (same keying)
  const [changingTemplateKey, setChangingTemplateKey] = useState<string | null>(null);
  const [clientEmail, setClientEmailRaw] = useState("");
  const cc = useCcField(DEAL_MAX_CC);
  const [prefilledForDealId, setPrefilledForDealId] = useState<string | null>(null);
  const [drawerPaymentType, setDrawerPaymentType] = useState<PaymentType>(dealPaymentType === "international" ? "international" : "local");
  // Unsaved edits since the last load/save/send. Guards the close action AND
  // stops a background refetch (window focus) from re-seeding over edits.
  const [dirty, setDirty] = useState(false);
  // Bumped on every user edit — a send only clears `dirty` when nothing was
  // edited while it was in flight (those edits weren't sent; the post-send
  // refetch must not re-seed over them).
  const editSeqRef = useRef(0);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);

  /** User edit of the active invoice. */
  const setInvoiceData = (next: InvoiceData) => {
    setInvoiceDataRaw(next);
    setDirty(true);
    editSeqRef.current++;
  };
  const setClientEmail = (v: string) => {
    setClientEmailRaw(v);
    setDirty(true);
    editSeqRef.current++;
  };

  const { data: agencyConfig } = useQuery<Record<string, string>>({
    queryKey: ["agency-config"],
    queryFn: async () => {
      const res = await fetch("/api/admin/agency-config");
      if (!res.ok) return {};
      return (await res.json()).data ?? {};
    },
    staleTime: 60_000,
  });
  // Fetch closer email + additional CCs for prefill
  const { data: ccPrefill } = useQuery<{ closerEmail: string | null; additionalCcEmails: string[] } | null>({
    queryKey: ["deal-cc-prefill", dealId],
    queryFn: async () => {
      if (!dealId) return null;
      const res = await fetch(`/api/admin/deals/closer-email?dealId=${dealId}`);
      if (!res.ok) return null;
      const json = await res.json();
      const data = json.data;
      if (!data) return null;
      if (typeof data === "string") return { closerEmail: data, additionalCcEmails: [] };
      return {
        closerEmail: data.closerEmail ?? null,
        additionalCcEmails: Array.isArray(data.additionalCcEmails) ? data.additionalCcEmails : [],
      };
    },
    enabled: !!dealId,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Reset CC state when switching deals
  const { setEmails: setCcEmails, setDraft: setCcDraft, setError: setCcError } = cc;
  useEffect(() => {
    setPrefilledForDealId(null);
    setCcEmails([]);
    setCcDraft("");
    setCcError(null);
  }, [dealId, setCcEmails, setCcDraft, setCcError]);

  // Prefill CC chip list once per dealId, from fresh closer email + deal's additional CCs.
  // Only runs the first time the query resolves for a given dealId — admin's subsequent
  // add/remove edits within the drawer are preserved.
  useEffect(() => {
    if (!dealId || !ccPrefill) return;
    if (prefilledForDealId === dealId) return;
    const seen = new Set<string>();
    const list: string[] = [];
    if (ccPrefill.closerEmail) {
      const v = ccPrefill.closerEmail.trim().toLowerCase();
      if (v) { list.push(v); seen.add(v); }
    }
    for (const addr of ccPrefill.additionalCcEmails) {
      const v = (addr || "").trim().toLowerCase();
      if (v && !seen.has(v)) { list.push(v); seen.add(v); }
    }
    setCcEmails(list.slice(0, DEAL_MAX_CC));
    setPrefilledForDealId(dealId);
  }, [dealId, ccPrefill, prefilledForDealId, setCcEmails]);

  // Sync additional invoices from server into local state
  useEffect(() => {
    if (additionalInvoices.length === 0) return;
    setAddlData((prev) => {
      const next = new Map(prev);
      for (const inv of additionalInvoices) {
        if (!next.has(inv.id)) {
          next.set(inv.id, withTotals(inv.invoiceData));
        }
      }
      return next;
    });
  }, [additionalInvoices]);

  useEffect(() => {
    if (!invoice || !agencyConfig) return;
    // Never re-seed over unsaved edits (a window-focus refetch lands here).
    if (dirty) return;
    const src = invoice.invoiceData;
    const logo = src.details.invoiceLogo || agencyConfig.default_logo || "";
    const theme = (!src.details.themeColor || src.details.themeColor === "#2563eb")
      ? (agencyConfig.default_theme_color || "#475569")
      : src.details.themeColor;

    // Migrate: if paymentInfo is empty but noteToCustomer has old payment text, move it
    let paymentInfo = src.details.paymentInfo;
    let noteToCustomer = src.details.noteToCustomer;
    const effectiveType: PaymentType = dealPaymentType === "international" ? "international" : "local";
    if (!paymentInfo && noteToCustomer) {
      paymentInfo = loadPaymentTemplate(agencyConfig, effectiveType);
      noteToCustomer = "";
    }

    const built: InvoiceData = withTotals({
      ...src,
      details: {
        ...src.details,
        invoiceLogo: logo,
        themeColor: theme,
        paymentInfo,
        noteToCustomer,
      },
    });
    primaryDataRef.current = built;
    // Only load into editor if primary tab is active — don't overwrite additional invoice edits
    if (activeInvoiceId === null) {
      setInvoiceDataRaw(built);
      // Sync toggle from loaded payment info or deal payment type
      setDrawerPaymentType(paymentInfo?.paymentType === "international" ? "international" : effectiveType);
    }
    setClientEmailRaw(invoice.clientEmail || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice, agencyConfig, dealPaymentType]);

  // Esc from the drawer is handled by InvoiceDrawerShell (nesting-aware).

  if (!dealId) return null;

  const dealValueDollars = dealValue / 100;
  const invoiceTotal = invoiceData?.details.totalAmount ?? 0;
  const mismatch = Math.abs(invoiceTotal - dealValueDollars) > 0.01;
  const activeAddl = activeInvoiceId ? additionalInvoices.find((i) => i.id === activeInvoiceId) ?? null : null;
  const displayNumber = activeAddl ? activeAddl.invoiceNumber : invoice?.invoiceNumber;
  const displayStatus = activeAddl ? activeAddl.status : invoice?.status;

  const setItems = (items: InvoiceItem[]) => {
    if (!invoiceData) return;
    setInvoiceData(withTotals({ ...invoiceData, details: { ...invoiceData.details, items } }));
  };

  const setDiscount = (discountDetails: DiscountDetails | null) => {
    if (!invoiceData) return;
    setInvoiceData(withTotals({ ...invoiceData, details: { ...invoiceData.details, discountDetails } }));
  };

  const switchToInvoice = (targetId: string | null) => {
    if (targetId === activeInvoiceId) return;
    // Flush current invoiceData to its storage
    if (invoiceData) {
      if (activeInvoiceId === null) {
        primaryDataRef.current = invoiceData;
      } else {
        setAddlData((prev) => new Map(prev).set(activeInvoiceId, invoiceData));
      }
    }
    // Load target data
    if (targetId === null) {
      setInvoiceDataRaw(primaryDataRef.current);
      const pt = primaryDataRef.current?.details.paymentInfo?.paymentType;
      setDrawerPaymentType(pt === "international" ? "international" : "local");
      setActiveInvoiceId(null);
    } else {
      const data = addlData.get(targetId);
      if (data) {
        setInvoiceDataRaw(data);
        const pt = data.details.paymentInfo?.paymentType;
        setDrawerPaymentType(pt === "international" ? "international" : "local");
        setActiveInvoiceId(targetId);
      }
    }
  };

  const handleAddInvoice = async () => {
    if (!dealId) return;
    setAddingInvoice(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/deal-invoices/additional", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId }),
      });
      if (res.ok) {
        const json = await res.json();
        const newInv = json.data as AdditionalInvoiceRecord;
        // Flush current tab before switching
        if (invoiceData) {
          if (activeInvoiceId === null) {
            primaryDataRef.current = invoiceData;
          } else {
            setAddlData((prev) => new Map(prev).set(activeInvoiceId, invoiceData));
          }
        }
        const seeded = withTotals(newInv.invoiceData);
        setAddlData((prev) => new Map(prev).set(newInv.id, seeded));
        queryClient.invalidateQueries({ queryKey: ["deal-additional-invoices", dealId] });
        setInvoiceDataRaw(seeded);
        const pt = seeded.details.paymentInfo?.paymentType;
        setDrawerPaymentType(pt === "international" ? "international" : "local");
        setActiveInvoiceId(newInv.id);
        setMsg({ type: "success", text: `Additional invoice #${newInv.invoiceNumber} created` });
      } else {
        const json = await res.json().catch(() => ({}));
        setMsg({ type: "error", text: json.error || "Failed to create invoice" });
      }
    } catch {
      setMsg({ type: "error", text: "Failed to create invoice" });
    } finally {
      setAddingInvoice(false);
    }
  };

  const handleAddContract = async () => {
    if (!dealId) return;
    setAddingContract(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/deal-contracts/additional", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["deal-additional-contracts", dealId] });
        setMsg({ type: "success", text: "Additional contract added — select a template" });
      } else {
        const json = await res.json().catch(() => ({}));
        setMsg({ type: "error", text: json.error || "Failed to add contract" });
      }
    } catch {
      setMsg({ type: "error", text: "Failed to add contract" });
    } finally {
      setAddingContract(false);
    }
  };

  const handleDeleteContract = async (id: string) => {
    const confirmed = typeof window !== "undefined"
      ? window.confirm("Delete this additional contract? If it was already sent, the Docuseal submission will be archived and the signing link will no longer work.")
      : false;
    if (!confirmed) return;
    setDeletingContractId(id);
    setMsg(null);
    try {
      if (previewingContractKey === id) setPreviewingContractKey(null);
      if (changingTemplateKey === id) setChangingTemplateKey(null);
      const res = await fetch(`/api/admin/deal-contracts/additional?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["deal-additional-contracts", dealId] });
        setMsg({ type: "success", text: "Contract deleted" });
      } else {
        const json = await res.json().catch(() => ({}));
        setMsg({ type: "error", text: json.error || "Failed to delete contract" });
      }
    } catch {
      setMsg({ type: "error", text: "Failed to delete contract" });
    } finally {
      setDeletingContractId(null);
    }
  };

  const handleDeleteAdditional = async (inv: AdditionalInvoiceRecord) => {
    const warning =
      inv.status === "sent"
        ? `Delete invoice #${inv.invoiceNumber}? It was already sent to the client — this removes our record and stored PDF.`
        : `Delete draft invoice #${inv.invoiceNumber}?`;
    if (!window.confirm(warning)) return;
    const id = inv.id;
    setDeletingId(id);
    setMsg(null);
    try {
      // If deleting the active tab, switch to primary first
      if (activeInvoiceId === id) {
        setInvoiceDataRaw(primaryDataRef.current);
        const pt = primaryDataRef.current?.details.paymentInfo?.paymentType;
        setDrawerPaymentType(pt === "international" ? "international" : "local");
        setActiveInvoiceId(null);
      }
      const res = await fetch(`/api/admin/deal-invoices/additional?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setAddlData((prev) => { const next = new Map(prev); next.delete(id); return next; });
        queryClient.invalidateQueries({ queryKey: ["deal-additional-invoices", dealId] });
        setMsg({ type: "success", text: "Invoice deleted" });
      } else {
        const json = await res.json().catch(() => ({}));
        setMsg({ type: "error", text: json.error || "Failed to delete invoice" });
      }
    } catch {
      setMsg({ type: "error", text: "Failed to delete invoice" });
    } finally {
      setDeletingId(null);
    }
  };

  /** Flush the active tab and resolve every invoice's latest data (with the
   *  recipient email stamped in, so the PDF prints the address it goes to). */
  const resolveAllInvoiceData = (): { primary: InvoiceData | null; additional: Map<string, InvoiceData> } => {
    const primaryRaw = activeInvoiceId === null ? invoiceData : primaryDataRef.current;
    const finalAddl = new Map(addlData);
    if (activeInvoiceId !== null && invoiceData) {
      finalAddl.set(activeInvoiceId, invoiceData);
    }
    const primary = primaryRaw ? withRecipientEmail(primaryRaw, clientEmail) : null;
    for (const [id, data] of finalAddl) finalAddl.set(id, withRecipientEmail(data, clientEmail));
    // Also flush to refs/state so they stay in sync
    if (activeInvoiceId === null) {
      primaryDataRef.current = primary;
      if (primary) setInvoiceDataRaw(primary);
    } else {
      primaryDataRef.current = primary;
      const active = finalAddl.get(activeInvoiceId);
      if (active) setInvoiceDataRaw(active);
    }
    setAddlData(finalAddl);
    return { primary, additional: finalAddl };
  };

  const handleSave = async () => {
    if (!invoice || !invoiceData) return;
    setSaving(true);
    setMsg(null);
    try {
      const { primary: primaryData, additional: finalAddl } = resolveAllInvoiceData();

      // Save primary + additional invoices in parallel
      const saveResults = await Promise.all([
        fetch("/api/admin/deal-invoices", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: invoice.id, invoiceData: primaryData, clientEmail: clientEmail.trim() }),
        }),
        ...[...finalAddl].map(([id, data]) =>
          fetch("/api/admin/deal-invoices/additional", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, invoiceData: data }),
          })
        ),
      ]);
      const allOk = saveResults.every((r) => r.ok);

      if (allOk) {
        setDirty(false);
        setMsg({ type: "success", text: finalAddl.size > 0 ? "All invoices saved" : "Invoice saved" });
        queryClient.invalidateQueries({ queryKey: ["deal-invoice", dealId] });
        if (finalAddl.size > 0) queryClient.invalidateQueries({ queryKey: ["deal-additional-invoices", dealId] });
      } else {
        setMsg({ type: "error", text: "Failed to save some invoices" });
      }
    } catch {
      setMsg({ type: "error", text: "Failed to save" });
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    if (!invoiceData) return;
    setGenerating(true);
    try {
      const blob = await pdf(<InvoicePdfDocument data={withRecipientEmail(invoiceData, clientEmail)} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${invoiceData.details.invoiceNumber || "draft"}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setMsg({ type: "error", text: "PDF generation failed" });
    } finally {
      setGenerating(false);
    }
  };

  const handleSend = async () => {
    if (!invoice || !invoiceData || !isValidEmail(clientEmail)) {
      setMsg({ type: "error", text: "A valid client email is required" });
      return;
    }
    // Commit any pending CC input so it isn't silently dropped — validated
    // BEFORE the (slow) PDF renders so bad input fails fast.
    const finalCcs = cc.finalize([clientEmail]);
    if (!finalCcs) {
      setMsg({ type: "error", text: "Fix the CC field before sending" });
      return;
    }
    setSending(true);
    setMsg(null);
    const editSeqAtSend = editSeqRef.current;
    try {
      // Flush the active tab to its storage, then resolve primary + additional
      // data locally. The invoice JSON rides along on the send request (the
      // server persists it with the sent status), so no separate save
      // round-trip is needed first.
      const { primary: primaryData, additional: finalAddl } = resolveAllInvoiceData();
      if (!primaryData) return;

      // Generate all PDFs in parallel
      const addlEntries = additionalInvoices
        .map((inv) => ({ inv, data: finalAddl.get(inv.id) }))
        .filter((e): e is { inv: typeof additionalInvoices[0]; data: InvoiceData } => !!e.data);

      const [primaryBlob, ...addlBlobs] = await Promise.all([
        pdf(<InvoicePdfDocument data={primaryData} />).toBlob(),
        ...addlEntries.map((e) => pdf(<InvoicePdfDocument data={e.data} />).toBlob()),
      ]);

      const formData = new FormData();
      formData.append("invoiceId", invoice.id);
      formData.append("email", clientEmail.trim());
      for (const addr of finalCcs) formData.append("cc", addr);
      formData.append("pdf", new File([primaryBlob], `invoice-${primaryData.details.invoiceNumber}.pdf`, { type: "application/pdf" }));
      formData.append("invoiceData", JSON.stringify(primaryData));
      if (canSendContract) {
        formData.append("sendContract", "true");
      }

      const additionalIds: string[] = [];
      for (let i = 0; i < addlEntries.length; i++) {
        const { inv, data } = addlEntries[i];
        formData.append("additionalPdfs", new File([addlBlobs[i]], `invoice-${data.details.invoiceNumber}.pdf`, { type: "application/pdf" }));
        formData.append("additionalInvoiceData", JSON.stringify(data));
        additionalIds.push(inv.id);
      }
      if (additionalIds.length > 0) {
        formData.append("additionalInvoiceIds", JSON.stringify(additionalIds));
      }

      const res = await fetch("/api/admin/deal-invoices/send", { method: "POST", body: formData });
      const json = await res.json().catch(() => ({}));
      const invoiceCount = 1 + additionalIds.length;
      const invoiceLabel = invoiceCount > 1 ? `${invoiceCount} invoices` : "Invoice";
      if (res.ok) {
        if (editSeqRef.current === editSeqAtSend) setDirty(false);
        const sentCount: number = Number(json.contractsSent ?? 0);
        const failedCount: number = Number(json.contractsFailed ?? 0);
        const contractNoun = (n: number) => (n === 1 ? "contract" : "contracts");
        if (sentCount > 0 && failedCount === 0) {
          setMsg({
            type: "success",
            text: `${invoiceLabel} & ${sentCount} ${contractNoun(sentCount)} sent to ${clientEmail}`,
          });
        } else if (sentCount > 0 && failedCount > 0) {
          setMsg({
            type: "error",
            text: `${invoiceLabel} sent. ${sentCount} ${contractNoun(sentCount)} sent, ${failedCount} failed: ${json.contractError || "see console"}`,
          });
        } else if (failedCount > 0) {
          setMsg({ type: "error", text: `${invoiceLabel} sent, but contracts failed: ${json.contractError || "see console"}` });
        } else {
          setMsg({ type: "success", text: `${invoiceLabel} sent to ${clientEmail}` });
        }
        queryClient.invalidateQueries({ queryKey: ["deal-invoice", dealId] });
        queryClient.invalidateQueries({ queryKey: ["deal-additional-invoices", dealId] });
        queryClient.invalidateQueries({ queryKey: ["deal-contract", dealId] });
        queryClient.invalidateQueries({ queryKey: ["deal-additional-contracts", dealId] });
        queryClient.invalidateQueries({ queryKey: ["admin-deals"] });
        queryClient.invalidateQueries({ queryKey: ["admin-deal-queue-metrics"] });
        queryClient.invalidateQueries({ queryKey: ["closer-deals"] });
      } else {
        setMsg({ type: "error", text: json.error || "Failed to send" });
      }
    } catch {
      setMsg({ type: "error", text: "Failed to send" });
    } finally {
      setSending(false);
    }
  };

  const sendLabel = (() => {
    if (sending) return "Sending...";
    const hasAddl = additionalInvoices.length > 0;
    const label = hasAddl ? "All Invoices" : "Invoice";
    const contractSuffix =
      totalSendableContracts === 0
        ? ""
        : totalSendableContracts === 1
        ? " & Contract"
        : ` & ${totalSendableContracts} Contracts`;
    if (isSent) return `Resend ${label}${contractSuffix}`;
    return contractSuffix
      ? `Send ${label}${contractSuffix}`
      : hasAddl
      ? `Send ${label}`
      : "Send to Client";
  })();

  const footer = invoiceData ? (
    <div className="space-y-2">
      {msg && (
        <div
          role="status"
          className={cn(
            "rounded-lg px-3 py-2 text-xs font-medium",
            msg.type === "success" ? "bg-emerald-500/5 text-emerald-600 border border-emerald-500/30" : "bg-destructive/5 text-destructive border border-destructive/30"
          )}
        >
          {msg.text}
        </div>
      )}
      {/* Sent info + View PDF */}
      {activeInvoiceId === null && isSent && invoice && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground">
            Sent {invoice.sentCount} time{invoice.sentCount !== 1 ? "s" : ""}
            {invoice.sentAt && <> · Last sent {new Date(invoice.sentAt).toLocaleDateString()}</>}
            {invoice.clientEmail && <> · {invoice.clientEmail}</>}
          </p>
          {invoice.hasPdf && (
            <button
              type="button"
              onClick={() => window.open(`/api/admin/deal-invoices/pdf?id=${invoice.id}`, "_blank")}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
            >
              <FileCheck className="h-3.5 w-3.5" />
              View sent PDF
            </button>
          )}
        </div>
      )}
      {activeAddl?.status === "sent" && activeAddl.hasPdf && (
        <button
          type="button"
          onClick={() => window.open(`/api/admin/deal-invoices/additional/pdf?id=${activeAddl.id}`, "_blank")}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
        >
          <FileCheck className="h-3.5 w-3.5" />
          View Sent Invoice PDF
        </button>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={handleSave} disabled={saving || sending} className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-60">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save
        </button>
        <button type="button" onClick={handleDownload} disabled={generating} className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-60">
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          PDF
        </button>
        <button type="button" onClick={() => setPdfPreviewOpen(true)} className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors">
          <Eye className="h-3.5 w-3.5" />
          Preview
        </button>
        {dirty && <span className="ml-auto text-[11px] font-medium text-amber-600 dark:text-amber-400">Unsaved changes</span>}
      </div>
      <button
        type="button"
        onClick={handleSend}
        disabled={sending || !clientEmail.trim()}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-all ac-gradient shadow-lg shadow-primary/20",
          (sending || !clientEmail.trim()) && "opacity-60 cursor-not-allowed"
        )}
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {sendLabel}
      </button>
    </div>
  ) : null;

  return (
    <>
      <InvoiceDrawerShell
        title="Invoice Review"
        badges={
          invoice && (
            <span className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
              displayStatus === "sent"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                : "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
            )}>
              {displayStatus === "sent" ? "Sent" : "Draft"}
            </span>
          )
        }
        subtitle={
          invoice ? (
            <>
              #{displayNumber} · Deal value {formatCurrencyValue(dealValueDollars, "USD")}
            </>
          ) : undefined
        }
        onClose={onClose}
        dirty={dirty}
        busy={sending}
        preview={invoiceData ? withRecipientEmail(invoiceData, clientEmail) : null}
        footer={footer}
      >
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && !invoice && (
          <p className="text-sm text-muted-foreground text-center py-12">No invoice found for this deal</p>
        )}

        {invoiceData && (
          <div className="space-y-4">
            {/* Mismatch warning — primary invoice only */}
            {activeInvoiceId === null && mismatch && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-600">
                  Invoice total ({formatCurrencyValue(invoiceTotal, "USD")}) differs from deal value ({formatCurrencyValue(dealValueDollars, "USD")})
                </p>
              </div>
            )}

            {/* Deal Notes */}
            {dealNotes && (
              <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Closer Notes</p>
                <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{dealNotes}</p>
              </div>
            )}

            {/* Invoice tabs — the primary plus any additional invoices */}
            <div>
              <label className={LABEL_CLS}>Invoices</label>
              <div className="flex flex-wrap items-center gap-1 rounded-lg bg-muted/50 p-1">
                <button
                  type="button"
                  onClick={() => switchToInvoice(null)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    activeInvoiceId === null ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  #{invoice?.invoiceNumber}
                  <span className={cn("inline-block h-1.5 w-1.5 rounded-full", isSent ? "bg-emerald-500" : "bg-amber-500")} />
                </button>
                {additionalInvoices.map((inv) => (
                  <div key={inv.id} className="relative flex items-center">
                    <button
                      type="button"
                      onClick={() => switchToInvoice(inv.id)}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs font-medium transition-colors pr-7",
                        activeInvoiceId === inv.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        #{inv.invoiceNumber}
                        <span className={cn(
                          "inline-block h-1.5 w-1.5 rounded-full",
                          inv.status === "sent" ? "bg-emerald-500" : "bg-amber-500"
                        )} />
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDeleteAdditional(inv); }}
                      disabled={deletingId === inv.id}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                      title="Delete invoice"
                      aria-label={`Delete invoice ${inv.invoiceNumber}`}
                    >
                      {deletingId === inv.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <X className="h-2.5 w-2.5" />}
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleAddInvoice}
                  disabled={addingInvoice}
                  className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
                  title="Add an additional invoice (starts as a copy of the primary)"
                >
                  {addingInvoice ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Invoice
                </button>
              </div>
            </div>

            <Section title="Recipient">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="deal-inv-email" className={LABEL_CLS}>Client email</label>
                  <input
                    id="deal-inv-email"
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="client@example.com"
                    className={cn(INPUT_CLS, clientEmail.trim() && !isValidEmail(clientEmail) && "border-destructive/60")}
                  />
                </div>
                <div>
                  <label htmlFor="deal-inv-billto" className={LABEL_CLS}>Bill to</label>
                  <input
                    id="deal-inv-billto"
                    type="text"
                    value={invoiceData.receiver.name}
                    onChange={(e) => setInvoiceData({ ...invoiceData, receiver: { ...invoiceData.receiver, name: e.target.value } })}
                    className={INPUT_CLS}
                  />
                </div>
              </div>
              {/* CC list (closer email + deal's additional CCs + admin-added) */}
              <div>
                <label htmlFor="deal-inv-cc" className={LABEL_CLS}>
                  CC <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <CcChipsInput field={cc} id="deal-inv-cc" exclude={[clientEmail]} placeholder="closer@example.com" />
              </div>
            </Section>

            <Section title="Details">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="deal-inv-date" className={LABEL_CLS}>Invoice date</label>
                  <input
                    id="deal-inv-date"
                    type="date"
                    value={invoiceData.details.invoiceDate}
                    onChange={(e) => setInvoiceData({ ...invoiceData, details: { ...invoiceData.details, invoiceDate: e.target.value } })}
                    className={INPUT_CLS}
                  />
                </div>
                <div>
                  <label htmlFor="deal-inv-due" className={LABEL_CLS}>Due date</label>
                  <input
                    id="deal-inv-due"
                    type="date"
                    value={invoiceData.details.dueDate}
                    onChange={(e) => setInvoiceData({ ...invoiceData, details: { ...invoiceData.details, dueDate: e.target.value } })}
                    className={INPUT_CLS}
                  />
                </div>
                <div>
                  <span className={LABEL_CLS}>Payment type</span>
                  <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
                    {(["local", "international"] as PaymentType[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={drawerPaymentType === t}
                        onClick={() => {
                          setDrawerPaymentType(t);
                          if (invoiceData && agencyConfig) {
                            const template = loadPaymentTemplate(agencyConfig, t);
                            setInvoiceData({ ...invoiceData, details: { ...invoiceData.details, paymentInfo: template, noteToCustomer: "" } });
                          }
                        }}
                        className={cn(
                          "flex-1 rounded-md px-2 py-1 text-xs font-medium capitalize transition-colors",
                          drawerPaymentType === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Section>

            <Section
              title="Line items"
              aside={
                <span className="text-xs text-muted-foreground">
                  {invoiceData.details.items.length} line{invoiceData.details.items.length !== 1 ? "s" : ""}
                </span>
              }
            >
              <LineItemsEditor
                items={invoiceData.details.items}
                currency={invoiceData.details.currency}
                onChange={setItems}
                minItems={1}
                allowSavePreset
                onNotice={setMsg}
              />
            </Section>

            <Section title="Discount & notes">
              <DiscountField discount={invoiceData.details.discountDetails} onChange={setDiscount} />
              <InvoiceNotesFields
                idPrefix="deal-inv"
                paymentTerms={invoiceData.details.paymentTerms}
                additionalNotes={invoiceData.details.additionalNotes}
                onChange={(patch) => setInvoiceData({ ...invoiceData, details: { ...invoiceData.details, ...patch } })}
              />
              <InvoiceTotalsSummary details={invoiceData.details} />
            </Section>

            {/* Contracts */}
            <div className="space-y-3">
              <ContractSection
                dealId={dealId}
                contract={contract ?? null}
                hasPendingContract={hasPendingContract}
                showPreview={previewingContractKey === "primary"}
                onTogglePreview={() =>
                  setPreviewingContractKey((k) => (k === "primary" ? null : "primary"))
                }
                changingTemplate={changingTemplateKey === "primary"}
                setChangingTemplate={(v) =>
                  setChangingTemplateKey(v ? "primary" : null)
                }
                queryClient={queryClient}
                label="Contract"
              />
              {additionalContracts.map((ac, idx) => (
                <ContractSection
                  key={ac.id}
                  dealId={dealId}
                  contract={ac}
                  hasPendingContract={ac.status === "pending"}
                  showPreview={previewingContractKey === ac.id}
                  onTogglePreview={() =>
                    setPreviewingContractKey((k) => (k === ac.id ? null : ac.id))
                  }
                  changingTemplate={changingTemplateKey === ac.id}
                  setChangingTemplate={(v) =>
                    setChangingTemplateKey(v ? ac.id : null)
                  }
                  queryClient={queryClient}
                  additionalContractId={ac.id}
                  onDelete={() => handleDeleteContract(ac.id)}
                  deleting={deletingContractId === ac.id}
                  label={`Contract ${idx + 2}`}
                />
              ))}
              {additionalContracts.length < 10 && (
                <button
                  type="button"
                  onClick={handleAddContract}
                  disabled={addingContract}
                  className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
                >
                  {addingContract ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Add Additional Contract
                </button>
              )}
            </div>
          </div>
        )}
      </InvoiceDrawerShell>

      {pdfPreviewOpen && invoiceData && (
        <InvoicePreviewDialog
          data={withRecipientEmail(invoiceData, clientEmail)}
          initialMode="pdf"
          title={`Invoice #${displayNumber ?? ""}`}
          onClose={() => setPdfPreviewOpen(false)}
        />
      )}
    </>
  );
}

/* ──────────────────────────────────────────
   Contract Section (template selector + preview)
   ────────────────────────────────────────── */

interface DocuSealTemplateOption {
  id: number;
  name: string;
}

interface ContractTemplateOption {
  id: string;
  name: string;
  docusealTemplateId: number;
}

function ContractSection({
  dealId,
  contract,
  hasPendingContract,
  showPreview,
  onTogglePreview,
  changingTemplate,
  setChangingTemplate,
  queryClient,
  additionalContractId,
  onDelete,
  deleting,
  label = "Contract",
}: {
  dealId: string | null;
  contract: { id?: string; status: string; contractTemplateId?: string | null; signedAt?: string | null; signingUrl?: string | null; documentUrls?: string[] | null; docusealTemplateOverrideId?: number | null; docusealSubmissionId?: number | null } | null;
  hasPendingContract: boolean;
  showPreview: boolean;
  onTogglePreview: () => void;
  changingTemplate: boolean;
  setChangingTemplate: (v: boolean) => void;
  queryClient: QueryClient;
  additionalContractId?: string;
  onDelete?: () => void;
  deleting?: boolean;
  label?: string;
}) {
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  // Selected template while the "Replace contract" picker is open (defaults to
  // the current template so an unchanged selection still regenerates fresh).
  const [replaceTemplateId, setReplaceTemplateId] = useState("");

  // Fetch contract templates (our local mapping table)
  const { data: contractTemplates = [] } = useQuery<ContractTemplateOption[]>({
    queryKey: ["contract-templates"],
    queryFn: async () => {
      const res = await fetch("/api/admin/contract-templates");
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 60_000,
  });

  // Fetch DocuSeal templates directly
  const { data: docusealTemplates = [] } = useQuery<DocuSealTemplateOption[]>({
    queryKey: ["docuseal-templates"],
    queryFn: async () => {
      const res = await fetch("/api/admin/docuseal-templates");
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 60_000,
    enabled: changingTemplate,
  });

  // Find the current template name
  const currentTemplate = contract?.contractTemplateId
    ? contractTemplates.find((t) => t.id === contract.contractTemplateId)
    : null;

  // Per-contract override for the Docuseal template, set when admin edits THIS contract's copy.
  // Precedence: persisted override (from DB) > in-flight override (from just-completed clone) > base template.
  const [docusealIdOverride, setDocusealIdOverride] = useState<number | null>(null);
  const persistedOverride = contract?.docusealTemplateOverrideId ?? null;
  const currentDocusealId = persistedOverride ?? docusealIdOverride ?? currentTemplate?.docusealTemplateId;
  const hasOverride = persistedOverride !== null || docusealIdOverride !== null;

  async function persistCloneOverride(newDocusealId: number): Promise<void> {
    // Optimistic local update so UI flips to "edit mode" immediately on next open
    setDocusealIdOverride(newDocusealId);
    try {
      const res = additionalContractId
        ? await fetch("/api/admin/deal-contracts/additional", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: additionalContractId, docusealTemplateOverrideId: newDocusealId }),
          })
        : await fetch("/api/admin/deal-contracts", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dealId, docusealTemplateOverrideId: newDocusealId }),
          });
      if (!res.ok) {
        // Roll back optimistic state so UI matches server; admin can retry Edit
        setDocusealIdOverride(null);
        console.error("[ContractSection] Failed to persist override:", res.status);
        return;
      }
      if (additionalContractId) {
        queryClient.invalidateQueries({ queryKey: ["deal-additional-contracts", dealId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["deal-contract", dealId] });
      }
    } catch (err) {
      setDocusealIdOverride(null);
      console.error("[ContractSection] Override PATCH threw:", err);
    }
  }

  async function handleTemplateChange(templateId: string) {
    if (!dealId) return;
    setSaving(true);
    try {
      const res = additionalContractId
        ? await fetch("/api/admin/deal-contracts/additional", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: additionalContractId, contractTemplateId: templateId || null }),
          })
        : await fetch("/api/admin/deal-contracts", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dealId, contractTemplateId: templateId || null }),
          });
      if (res.ok) {
        if (additionalContractId) {
          queryClient.invalidateQueries({ queryKey: ["deal-additional-contracts", dealId] });
        } else {
          queryClient.invalidateQueries({ queryKey: ["deal-contract", dealId] });
        }
        setChangingTemplate(false);
        setDocusealIdOverride(null); // Reset clone override when template changes
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  // Replace an already-sent (not signed) contract with a fresh one. Server-side
  // this archives the old DocuSeal submission and resets the row to "pending"
  // with the chosen template, so it sends fresh with the next invoice send.
  async function handleReplaceContract(templateId: string) {
    if (!dealId) return;
    if (!confirm("Replace this contract? The current signing link will be invalidated and the contract will reset to send fresh with the next invoice.")) {
      return;
    }
    setSaving(true);
    try {
      const res = additionalContractId
        ? await fetch("/api/admin/deal-contracts/additional", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: additionalContractId, contractTemplateId: templateId || null, replace: true }),
          })
        : await fetch("/api/admin/deal-contracts", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dealId, contractTemplateId: templateId || null, replace: true }),
          });
      if (res.ok) {
        let warning: string | undefined;
        try {
          const json = await res.json();
          warning = typeof json?.warning === "string" ? json.warning : undefined;
        } catch {
          /* no body */
        }
        if (additionalContractId) {
          queryClient.invalidateQueries({ queryKey: ["deal-additional-contracts", dealId] });
        } else {
          queryClient.invalidateQueries({ queryKey: ["deal-contract", dealId] });
        }
        setChangingTemplate(false);
        setDocusealIdOverride(null);
        if (warning) alert(warning);
      } else {
        // Surface the actionable failures (e.g. a signed-race "Cannot replace a
        // signed contract", or "template not found") instead of silently
        // stopping the spinner with the picker still open.
        let message = "Failed to replace the contract. Please try again.";
        try {
          const json = await res.json();
          if (typeof json?.error === "string") message = json.error;
        } catch {
          /* no body */
        }
        alert(message);
      }
    } catch {
      alert("Failed to replace the contract. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  // Re-pull the live status from DocuSeal for this contract (primary or
  // additional). Reconciles rows whose webhook event was missed/dropped — e.g.
  // an already-signed contract still showing "Awaiting Signature".
  async function handleSyncStatus() {
    if (!dealId || syncing) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/deal-contracts/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(additionalContractId ? { additionalContractId } : { dealId }),
      });
      if (res.ok) {
        if (additionalContractId) {
          queryClient.invalidateQueries({ queryKey: ["deal-additional-contracts", dealId] });
        } else {
          queryClient.invalidateQueries({ queryKey: ["deal-contract", dealId] });
        }
      }
    } catch {
      // ignore
    } finally {
      setSyncing(false);
    }
  }

  // Already sent/signed contract — show status + allow editing for resend (except signed)
  if (contract && !hasPendingContract) {
    const canEdit = contract.status === "sent" || contract.status === "viewed" || contract.status === "expired" || contract.status === "declined";
    return (
      <div className="rounded-xl border border-border/50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSignature className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold",
              contract.status === "signed" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
              contract.status === "sent" && "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
              contract.status === "viewed" && "bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400",
              (contract.status === "expired" || contract.status === "declined") && "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400"
            )}>
              {contract.status === "signed" ? "Signed" :
               contract.status === "sent" ? "Awaiting Signature" :
               contract.status === "viewed" ? "Viewed" :
               contract.status === "expired" ? "Expired" :
               contract.status === "declined" ? "Declined" : contract.status}
            </span>
            {contract.docusealSubmissionId && (
              <button
                onClick={handleSyncStatus}
                disabled={syncing}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                title="Refresh status from DocuSeal"
              >
                <RotateCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                disabled={deleting}
                className="p-1 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                title="Delete contract"
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        </div>
        {currentTemplate && (
          <p className="text-xs text-muted-foreground">Template: {currentTemplate.name}</p>
        )}
        {contract.signedAt && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            Signed {new Date(contract.signedAt).toLocaleDateString()}
          </p>
        )}
        {contract.documentUrls && contract.documentUrls.length > 0 && (
          <div className="space-y-1">
            {contract.documentUrls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                <ExternalLink className="h-3 w-3" />
                Signed Document {i + 1}
              </a>
            ))}
          </div>
        )}
        {/* Allow editing contract for resend (not for signed contracts) */}
        {canEdit && currentDocusealId && (
          <>
            <button
              onClick={onTogglePreview}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors"
            >
              <Eye className="h-3.5 w-3.5" />
              {showPreview ? "Hide Contract Preview" : "Preview / Edit Contract"}
            </button>
            {showPreview && (
              <ContractPreviewOverlay
                docusealTemplateId={currentDocusealId}
                alreadyCloned={hasOverride}
                onClose={onTogglePreview}
                onPersistClone={persistCloneOverride}
              />
            )}
          </>
        )}
        {/* Replace the sent contract with a fresh one (different or same
            template). Archives the old signing link and resets to "pending"
            so it sends fresh with the next invoice. Not for signed contracts. */}
        {canEdit && (
          changingTemplate ? (
            <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-2.5">
              <label className="text-xs font-medium text-foreground">Replace with template</label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
                value={replaceTemplateId}
                onChange={(e) => setReplaceTemplateId(e.target.value)}
                disabled={saving}
              >
                <option value="">No contract</option>
                {contractTemplates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground">
                Archives the current signing link and resets the contract to send fresh with the next invoice.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleReplaceContract(replaceTemplateId)}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white ac-gradient disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Replace
                </button>
                <button
                  onClick={() => setChangingTemplate(false)}
                  disabled={saving}
                  className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => {
                setReplaceTemplateId(contract.contractTemplateId || "");
                setChangingTemplate(true);
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Replace contract
            </button>
          )
        )}
      </div>
    );
  }

  // Pending or no contract — show selector + preview
  return (
    <div className="rounded-xl border border-border/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSignature className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          {hasPendingContract && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
              Will send with invoice
            </span>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              disabled={deleting}
              className="p-1 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
              title="Delete contract"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Template selector */}
      {changingTemplate ? (
        <div className="space-y-2">
          <label className="text-xs font-medium text-foreground">Choose Contract Template</label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
            value={contract?.contractTemplateId || ""}
            onChange={(e) => handleTemplateChange(e.target.value)}
            disabled={saving}
          >
            <option value="">No contract</option>
            {contractTemplates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {docusealTemplates.length > 0 && contractTemplates.length === 0 && (
            <p className="text-[10px] text-muted-foreground">
              No templates mapped yet. Go to Closers &rarr; Contracts to map DocuSeal templates.
            </p>
          )}
          <button
            onClick={() => setChangingTemplate(false)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-xs text-foreground">
            {currentTemplate ? currentTemplate.name : contract ? "Template selected" : "No contract template"}
          </p>
          <button
            onClick={() => setChangingTemplate(true)}
            className="text-xs text-primary hover:underline"
          >
            {contract ? "Change" : "Select template"}
          </button>
        </div>
      )}

      {/* Preview button & embedded preview */}
      {currentDocusealId && (
        <>
          <button
            onClick={onTogglePreview}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors"
          >
            <Eye className="h-3.5 w-3.5" />
            {showPreview ? "Hide Contract Preview" : "Preview Contract"}
          </button>
          {showPreview && (
            <ContractPreviewOverlay
              docusealTemplateId={currentDocusealId}
              alreadyCloned={hasOverride}
              onClose={onTogglePreview}
              onPersistClone={persistCloneOverride}
            />
          )}
        </>
      )}
    </div>
  );
}

function ContractPreviewOverlay({ docusealTemplateId, alreadyCloned, onClose, onPersistClone }: { docusealTemplateId: number; alreadyCloned?: boolean; onClose: () => void; onPersistClone?: (newDocusealId: number) => Promise<void> }) {
  const [token, setToken] = useState<string | null>(null);
  const [clonedId, setClonedId] = useState<number | null>(null);
  const [editing, setEditing] = useState(alreadyCloned ?? false);
  const [loading, setLoading] = useState(true);
  const [switchingToEdit, setSwitchingToEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch builder token — initially without cloning (view mode)
  // If alreadyCloned, we're reopening an existing clone (also no new clone needed)
  useEffect(() => {
    let cancelled = false;
    async function fetchToken() {
      try {
        const res = await fetch("/api/admin/docuseal-templates/builder-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateId: docusealTemplateId, clone: false }),
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error || "Failed to load preview");
          return;
        }
        setToken(json.data.token);
      } catch {
        if (!cancelled) setError("Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchToken();
    return () => { cancelled = true; };
  }, [docusealTemplateId]);

  // "Edit Contract" — clone the template and reload builder with the clone
  async function handleStartEditing() {
    setSwitchingToEdit(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/docuseal-templates/builder-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: docusealTemplateId, clone: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to create editable copy");
        return;
      }
      setToken(json.data.token);
      if (json.data.clonedTemplateId) {
        setClonedId(json.data.clonedTemplateId);
      }
      setEditing(true);
    } catch {
      setError("Network error");
    } finally {
      setSwitchingToEdit(false);
    }
  }

  async function handleClose() {
    // Persist the per-contract override if we actually cloned (edited)
    if (clonedId && onPersistClone) {
      try {
        await onPersistClone(clonedId);
      } catch (err) {
        console.error("[ContractPreviewOverlay] Failed to persist clone:", err);
      }
    }
    onClose();
  }

  // Nesting-aware: Escape closes this editor only, not the invoice drawer
  // underneath (which used to close too and drop its unsaved edits).
  useEscapeKey(() => { void handleClose(); });

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div className="fixed inset-0 md:inset-4 z-[70] flex flex-col md:rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <h3 className="text-sm font-semibold text-foreground">
            {editing ? "Contract Editor" : "Contract Preview"}
          </h3>
          <div className="flex items-center gap-2">
            {!editing && !loading && token && (
              <button
                onClick={handleStartEditing}
                disabled={switchingToEdit}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {switchingToEdit ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pencil className="h-3 w-3" />}
                Edit Contract
              </button>
            )}
            <button onClick={handleClose} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        {/* Light surface while the builder shows, in every theme — DocuSeal
            renders in-page, transparent with dark text (unreadable on dark). */}
        <div
          className={cn(
            "flex-1 overflow-auto",
            token && !switchingToEdit && "bg-white text-neutral-900"
          )}
        >
          {(loading || switchingToEdit) && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {error && <p className="text-sm text-red-500 p-6">{error}</p>}
          {token && !switchingToEdit && (
            <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
              <DocusealBuilder
                token={token}
                withSendButton={false}
                withSignYourselfButton={false}
                withTitle={false}
                autosave={editing}
                className="w-full h-full"
                style={{ minHeight: "100%" }}
              />
            </Suspense>
          )}
        </div>
      </div>
    </>
  );
}
