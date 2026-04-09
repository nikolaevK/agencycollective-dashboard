"use client";

import { useState, useEffect, lazy, Suspense } from "react";
import { X, Download, Eye, Send, Loader2, Save, AlertTriangle, Plus, Trash2, BookmarkPlus, GripVertical, FileCheck, FileSignature, ChevronDown, ExternalLink } from "lucide-react";
import { pdf } from "@react-pdf/renderer";
import { useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useDealInvoice } from "@/hooks/useDealInvoice";
import { useDealContract } from "@/hooks/useDealContract";
import { InvoicePdfDocument } from "@/components/invoice/pdf/InvoicePdfTemplate";
import { formatCurrencyValue, createEmptyItem } from "@/lib/invoice/validation";
import { InvoiceServiceSelector } from "@/components/invoice/InvoiceServiceSelector";
import type { InvoiceData, InvoiceItem, PaymentInfo, PaymentType } from "@/types/invoice";
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
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow";

function loadPaymentTemplate(config: Record<string, string>, type: PaymentType): PaymentInfo {
  return loadPaymentInfoFromConfig(config, type) ?? emptyPaymentInfo(type);
}

function SortableDrawerRow({
  item,
  idx,
  total,
  currency,
  onUpdate,
  onRemove,
}: {
  item: InvoiceItem;
  idx: number;
  total: number;
  currency: string;
  onUpdate: (idx: number, field: keyof InvoiceItem, value: string | number) => void;
  onRemove: (idx: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("hidden sm:flex items-start gap-1 py-1.5 border-b border-border/30", isDragging && "opacity-50 bg-accent rounded")}
    >
      <div className="w-6 pt-2 flex items-center">
        <button className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none" {...attributes} {...listeners}>
          <GripVertical className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-[3] pr-2">
        <input type="text" value={item.name} onChange={(e) => onUpdate(idx, "name", e.target.value)} placeholder="Service name" className={cn(INPUT_CLS, "h-8 text-xs")} />
      </div>
      <div className="flex-[3] pr-2">
        <textarea
          value={item.description}
          onChange={(e) => onUpdate(idx, "description", e.target.value)}
          placeholder="Description"
          rows={2}
          className="flex w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow resize-y min-h-[32px]"
        />
      </div>
      <div className="w-14 pr-2">
        <input type="number" min="0" step="any" value={item.quantity || ""} onChange={(e) => onUpdate(idx, "quantity", parseFloat(e.target.value) || 0)} className={cn(INPUT_CLS, "h-8 text-xs text-right")} />
      </div>
      <div className="w-20 pr-2">
        <input type="number" min="0" step="any" value={item.unitPrice || ""} onChange={(e) => onUpdate(idx, "unitPrice", parseFloat(e.target.value) || 0)} className={cn(INPUT_CLS, "h-8 text-xs text-right")} />
      </div>
      <div className="w-20 pr-1 pt-1.5 text-right text-xs font-medium text-foreground whitespace-nowrap">
        {formatCurrencyValue(item.quantity * item.unitPrice, currency)}
      </div>
      <div className="w-7 pt-1.5 flex items-center">
        <button onClick={() => onRemove(idx)} disabled={total <= 1} className="p-1 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-20" title="Remove">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

export function DealInvoiceDrawer({ dealId, dealValue, dealPaymentType, dealNotes, onClose }: Props) {
  const queryClient = useQueryClient();
  const { data: invoice, isLoading } = useDealInvoice(dealId);
  const { data: contract } = useDealContract(dealId);
  const hasPendingContract = contract?.status === "pending";
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [showContractPreview, setShowContractPreview] = useState(false);
  const [changingTemplate, setChangingTemplate] = useState(false);
  const [clientEmail, setClientEmail] = useState("");
  const [ccEmail, setCcEmail] = useState("");
  const [drawerPaymentType, setDrawerPaymentType] = useState<PaymentType>(dealPaymentType === "international" ? "international" : "local");

  const { data: agencyConfig } = useQuery<Record<string, string>>({
    queryKey: ["agency-config"],
    queryFn: async () => {
      const res = await fetch("/api/agency-config");
      if (!res.ok) return {};
      return (await res.json()).data ?? {};
    },
    staleTime: 60_000,
  });
  // Fetch closer email for CC prefill
  const { data: closerEmail } = useQuery<string | null>({
    queryKey: ["deal-closer-email", dealId],
    queryFn: async () => {
      if (!dealId) return null;
      const res = await fetch(`/api/admin/deals/closer-email?dealId=${dealId}`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.data ?? null;
    },
    enabled: !!dealId,
    staleTime: 60_000,
  });

  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savingPreset, setSavingPreset] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Prefill CC with closer email once loaded
  useEffect(() => {
    if (closerEmail && !ccEmail) setCcEmail(closerEmail);
  }, [closerEmail]);

  useEffect(() => {
    if (!invoice || !agencyConfig) return;
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

    // Sync toggle from loaded payment info or deal payment type
    const resolvedType: PaymentType = paymentInfo?.paymentType === "international" ? "international" : effectiveType;
    setDrawerPaymentType(resolvedType);

    setInvoiceData({
      ...src,
      details: {
        ...src.details,
        invoiceLogo: logo,
        themeColor: theme,
        paymentInfo,
        noteToCustomer,
      },
    });
    setClientEmail(invoice.clientEmail || "");
  }, [invoice, agencyConfig, dealPaymentType]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  if (!dealId) return null;

  const dealValueDollars = dealValue / 100;
  const invoiceTotal = invoiceData?.details.totalAmount ?? 0;
  const mismatch = Math.abs(invoiceTotal - dealValueDollars) > 0.01;

  const recalc = (data: InvoiceData): InvoiceData => {
    const subTotal = data.details.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
    return {
      ...data,
      details: {
        ...data.details,
        subTotal: Math.round(subTotal * 100) / 100,
        totalAmount: Math.round(subTotal * 100) / 100,
      },
    };
  };

  const updateItem = (idx: number, field: keyof InvoiceItem, value: string | number) => {
    if (!invoiceData) return;
    const items = invoiceData.details.items.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value };
      if (field === "quantity" || field === "unitPrice") {
        updated.total = Math.round(updated.quantity * updated.unitPrice * 100) / 100;
      }
      return updated;
    });
    setInvoiceData(recalc({ ...invoiceData, details: { ...invoiceData.details, items } }));
  };

  const addItem = () => {
    if (!invoiceData) return;
    setInvoiceData(recalc({
      ...invoiceData,
      details: {
        ...invoiceData.details,
        items: [...invoiceData.details.items, createEmptyItem()],
      },
    }));
  };

  const removeItem = (idx: number) => {
    if (!invoiceData || invoiceData.details.items.length <= 1) return;
    setInvoiceData(recalc({
      ...invoiceData,
      details: {
        ...invoiceData.details,
        items: invoiceData.details.items.filter((_, i) => i !== idx),
      },
    }));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    if (!invoiceData) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const items = invoiceData.details.items;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    setInvoiceData(recalc({
      ...invoiceData,
      details: { ...invoiceData.details, items: arrayMove(items, oldIndex, newIndex) },
    }));
  };

  const saveItemAsPreset = async (idx: number) => {
    if (!invoiceData) return;
    const item = invoiceData.details.items[idx];
    if (!item.name.trim()) return;
    setSavingPreset(idx);
    try {
      await fetch("/api/admin/invoice-services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: item.name,
          description: item.description,
          rate: Math.round(item.unitPrice * 100),
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["invoice-services"] });
      setMsg({ type: "success", text: `"${item.name}" saved as preset` });
    } catch {
      setMsg({ type: "error", text: "Failed to save preset" });
    } finally {
      setSavingPreset(null);
    }
  };

  const handleSave = async () => {
    if (!invoice || !invoiceData) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/deal-invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: invoice.id, invoiceData, clientEmail }),
      });
      if (res.ok) {
        setMsg({ type: "success", text: "Invoice saved" });
        queryClient.invalidateQueries({ queryKey: ["deal-invoice", dealId] });
      } else {
        setMsg({ type: "error", text: "Failed to save" });
      }
    } catch {
      setMsg({ type: "error", text: "Failed to save" });
    } finally {
      setSaving(false);
    }
  };

  const generateBlob = async (): Promise<Blob | null> => {
    if (!invoiceData) return null;
    setGenerating(true);
    try {
      return await pdf(<InvoicePdfDocument data={invoiceData} />).toBlob();
    } catch {
      setMsg({ type: "error", text: "PDF generation failed" });
      return null;
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    const blob = await generateBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoice-${invoiceData?.details.invoiceNumber || "draft"}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePreview = async () => {
    const blob = await generateBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const handleSend = async () => {
    if (!invoice || !invoiceData || !clientEmail.trim()) {
      setMsg({ type: "error", text: "Client email is required" });
      return;
    }
    await handleSave();
    setSending(true);
    setMsg(null);
    try {
      const blob = await generateBlob();
      if (!blob) return;
      const formData = new FormData();
      formData.append("invoiceId", invoice.id);
      formData.append("email", clientEmail);
      if (ccEmail.trim()) formData.append("cc", ccEmail.trim());
      formData.append("pdf", new File([blob], `invoice-${invoiceData.details.invoiceNumber}.pdf`, { type: "application/pdf" }));
      if (hasPendingContract) {
        formData.append("sendContract", "true");
      }
      const res = await fetch("/api/admin/deal-invoices/send", { method: "POST", body: formData });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        if (json.contractSent) {
          setMsg({ type: "success", text: "Invoice & contract sent to " + clientEmail });
        } else if (hasPendingContract && json.contractError) {
          setMsg({ type: "error", text: "Invoice sent, but contract failed: " + json.contractError });
        } else {
          setMsg({ type: "success", text: "Invoice sent to " + clientEmail });
        }
        queryClient.invalidateQueries({ queryKey: ["deal-invoice", dealId] });
        queryClient.invalidateQueries({ queryKey: ["deal-contract", dealId] });
        queryClient.invalidateQueries({ queryKey: ["admin-deals"] });
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

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed right-0 top-0 bottom-0 z-[60] w-full max-w-xl bg-card border-l border-border shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Invoice Review</h3>
            {invoice && (
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground">#{invoice.invoiceNumber}</span>
                <span className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                  invoice.status === "sent"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                )}>
                  {invoice.status === "sent" ? "Sent" : "Draft"}
                </span>
              </div>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && !invoice && (
            <p className="text-sm text-muted-foreground text-center py-12">No invoice found for this deal</p>
          )}

          {invoiceData && (
            <>
              {/* Mismatch warning */}
              {mismatch && (
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

              {/* Payment Type Toggle */}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Payment Type</label>
                <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setDrawerPaymentType("local");
                      if (invoiceData && agencyConfig) {
                        const template = loadPaymentTemplate(agencyConfig, "local");
                        setInvoiceData({ ...invoiceData, details: { ...invoiceData.details, paymentInfo: template, noteToCustomer: "" } });
                      }
                    }}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${drawerPaymentType === "local" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
                  >
                    Local
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDrawerPaymentType("international");
                      if (invoiceData && agencyConfig) {
                        const template = loadPaymentTemplate(agencyConfig, "international");
                        setInvoiceData({ ...invoiceData, details: { ...invoiceData.details, paymentInfo: template, noteToCustomer: "" } });
                      }
                    }}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${drawerPaymentType === "international" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
                  >
                    International
                  </button>
                </div>
              </div>

              {/* Client email */}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Client Email</label>
                <input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="client@example.com" className={INPUT_CLS} />
              </div>

              {/* CC (closer email) */}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">CC <span className="font-normal text-muted-foreground">(optional)</span></label>
                <input type="email" value={ccEmail} onChange={(e) => setCcEmail(e.target.value)} placeholder="closer@example.com" className={INPUT_CLS} />
              </div>

              {/* Invoice Date & Due Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Invoice Date</label>
                  <input
                    type="date"
                    value={invoiceData.details.invoiceDate}
                    onChange={(e) => setInvoiceData({ ...invoiceData, details: { ...invoiceData.details, invoiceDate: e.target.value } })}
                    className={INPUT_CLS}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Due Date</label>
                  <input
                    type="date"
                    value={invoiceData.details.dueDate}
                    onChange={(e) => setInvoiceData({ ...invoiceData, details: { ...invoiceData.details, dueDate: e.target.value } })}
                    className={INPUT_CLS}
                  />
                </div>
              </div>

              {/* Bill To */}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Bill To</label>
                <input
                  type="text"
                  value={invoiceData.receiver.name}
                  onChange={(e) => setInvoiceData({ ...invoiceData, receiver: { ...invoiceData.receiver, name: e.target.value } })}
                  className={INPUT_CLS}
                />
              </div>

              {/* Line Items — table layout with drag-and-drop */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wide">Line Items</h4>

                {/* Table header */}
                <div className="hidden sm:flex items-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border pb-2">
                  <div className="w-6" />
                  <div className="flex-[3] pr-2">Item</div>
                  <div className="flex-[3] pr-2">Description</div>
                  <div className="w-14 pr-2 text-right">Qty</div>
                  <div className="w-20 pr-2 text-right">Unit Price</div>
                  <div className="w-20 pr-1 text-right">Total</div>
                  <div className="w-7" />
                </div>

                {/* Desktop rows with DnD */}
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={invoiceData.details.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                    {invoiceData.details.items.map((item, idx) => (
                      <SortableDrawerRow
                        key={item.id}
                        item={item}
                        idx={idx}
                        total={invoiceData.details.items.length}
                        currency={invoiceData.details.currency}
                        onUpdate={updateItem}
                        onRemove={removeItem}
                      />
                    ))}
                  </SortableContext>
                </DndContext>

                {/* Mobile cards (no dnd) */}
                <div className="sm:hidden space-y-2">
                  {invoiceData.details.items.map((item, idx) => (
                    <div key={item.id} className="rounded-lg border border-border/50 bg-background p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <input type="text" value={item.name} onChange={(e) => updateItem(idx, "name", e.target.value)} placeholder="Service name" className={cn(INPUT_CLS, "font-medium flex-1")} />
                        <button onClick={() => removeItem(idx)} disabled={invoiceData.details.items.length <= 1} className="p-1.5 text-muted-foreground hover:text-destructive disabled:opacity-20 shrink-0">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <textarea value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)} placeholder="Description" rows={2} className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow resize-y" />
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="mb-0.5 block text-[10px] text-muted-foreground">Qty</label>
                          <input type="number" min="0" step="any" value={item.quantity || ""} onChange={(e) => updateItem(idx, "quantity", parseFloat(e.target.value) || 0)} className={cn(INPUT_CLS, "text-right")} />
                        </div>
                        <div>
                          <label className="mb-0.5 block text-[10px] text-muted-foreground">Rate</label>
                          <input type="number" min="0" step="any" value={item.unitPrice || ""} onChange={(e) => updateItem(idx, "unitPrice", parseFloat(e.target.value) || 0)} className={cn(INPUT_CLS, "text-right")} />
                        </div>
                        <div>
                          <label className="mb-0.5 block text-[10px] text-muted-foreground">Total</label>
                          <div className="flex h-9 items-center justify-end text-sm font-medium">{formatCurrencyValue(item.quantity * item.unitPrice, invoiceData.details.currency)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add item / Add service + Subtotal */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  <div className="flex items-center gap-4">
                    <button onClick={addItem} className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
                      <Plus className="h-3.5 w-3.5" />
                      Add Item
                    </button>
                    <InvoiceServiceSelector onSelect={(item) => {
                      if (!invoiceData) return;
                      setInvoiceData(recalc({
                        ...invoiceData,
                        details: { ...invoiceData.details, items: [...invoiceData.details.items, item] },
                      }));
                    }} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Subtotal:{" "}
                    <span className="font-semibold text-foreground">
                      {formatCurrencyValue(invoiceData.details.subTotal, invoiceData.details.currency)}
                    </span>
                  </div>
                </div>

                {/* Save item as preset hint */}
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-1">
                  <BookmarkPlus className="h-3 w-3" />
                  Click bookmark on any item to save it as a preset for future invoices
                </div>

                {/* Bookmark buttons row */}
                <div className="flex flex-wrap gap-1">
                  {invoiceData.details.items.map((item, idx) => (
                    item.name.trim() && (
                      <button
                        key={item.id}
                        onClick={() => saveItemAsPreset(idx)}
                        disabled={savingPreset === idx}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors disabled:opacity-50"
                        title={`Save "${item.name}" as preset`}
                      >
                        {savingPreset === idx ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <BookmarkPlus className="h-2.5 w-2.5" />}
                        {item.name.length > 20 ? item.name.slice(0, 20) + "..." : item.name}
                      </button>
                    )
                  ))}
                </div>
              </div>

              {/* Total */}
              <div className="flex justify-between items-center pt-3 border-t border-border">
                <span className="text-sm font-medium text-foreground">Total</span>
                <span className="text-lg font-bold text-foreground">
                  {formatCurrencyValue(invoiceData.details.totalAmount, invoiceData.details.currency)}
                </span>
              </div>

              {/* Contract Section */}
              <ContractSection
                dealId={dealId}
                contract={contract ?? null}
                hasPendingContract={hasPendingContract}
                showPreview={showContractPreview}
                onTogglePreview={() => setShowContractPreview((v) => !v)}
                changingTemplate={changingTemplate}
                setChangingTemplate={setChangingTemplate}
                queryClient={queryClient}
              />

              {/* Messages */}
              {msg && (
                <div className={cn(
                  "rounded-lg px-3 py-2 text-xs font-medium",
                  msg.type === "success" ? "bg-emerald-500/5 text-emerald-600 border border-emerald-500/30" : "bg-destructive/5 text-destructive border border-destructive/30"
                )}>
                  {msg.text}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        {invoiceData && (
          <div className="border-t border-border px-5 py-4 space-y-2 shrink-0">
            {/* View sent PDF */}
            {invoice?.hasPdf && (
              <button
                onClick={() => window.open(`/api/admin/deal-invoices/pdf?id=${invoice.id}`, "_blank")}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
              >
                <FileCheck className="h-3.5 w-3.5" />
                View Sent Invoice PDF
              </button>
            )}
            <div className="grid grid-cols-3 gap-2">
              <button onClick={handleSave} disabled={saving} className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-60">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save
              </button>
              <button onClick={handleDownload} disabled={generating} className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-60">
                <Download className="h-3.5 w-3.5" />
                PDF
              </button>
              <button onClick={handlePreview} disabled={generating} className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-60">
                <Eye className="h-3.5 w-3.5" />
                Preview
              </button>
            </div>
            <button
              onClick={handleSend}
              disabled={sending || !clientEmail.trim()}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-all ac-gradient shadow-lg shadow-primary/20",
                (sending || !clientEmail.trim()) && "opacity-60 cursor-not-allowed"
              )}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? "Sending..." : hasPendingContract ? "Send Invoice & Contract" : "Send to Client"}
            </button>
          </div>
        )}
      </div>
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
}: {
  dealId: string | null;
  contract: { id?: string; status: string; contractTemplateId?: string | null; signedAt?: string | null; signingUrl?: string | null; documentUrls?: string[] | null } | null;
  hasPendingContract: boolean;
  showPreview: boolean;
  onTogglePreview: () => void;
  changingTemplate: boolean;
  setChangingTemplate: (v: boolean) => void;
  queryClient: QueryClient;
}) {
  const [saving, setSaving] = useState(false);

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

  const currentDocusealId = currentTemplate?.docusealTemplateId;

  async function handleTemplateChange(templateId: string) {
    if (!dealId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/deal-contracts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, contractTemplateId: templateId || null }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["deal-contract", dealId] });
        setChangingTemplate(false);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  // Already sent/signed contract
  if (contract && !hasPendingContract) {
    return (
      <div className="rounded-xl border border-border/50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSignature className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contract</span>
          </div>
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
      </div>
    );
  }

  // Pending or no contract — show selector + preview
  return (
    <div className="rounded-xl border border-border/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSignature className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contract</span>
        </div>
        {hasPendingContract && (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
            Will send with invoice
          </span>
        )}
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
              onClose={onTogglePreview}
            />
          )}
        </>
      )}
    </div>
  );
}

function ContractPreviewOverlay({ docusealTemplateId, onClose }: { docusealTemplateId: number; onClose: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchToken() {
      try {
        const res = await fetch("/api/admin/docuseal-templates/builder-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateId: docusealTemplateId }),
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

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-4 z-[70] flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <h3 className="text-sm font-semibold text-foreground">Contract Preview</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {error && <p className="text-sm text-red-500 p-6">{error}</p>}
          {token && (
            <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
              <DocusealBuilder
                token={token}
                withSendButton={false}
                withSignYourselfButton={false}
                withTitle={false}
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
