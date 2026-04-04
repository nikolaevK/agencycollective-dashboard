"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import type {
  InvoiceData,
  InvoiceItem,
  InvoiceSender,
  InvoiceReceiver,
  DiscountDetails,
  TaxDetails,
  ShippingDetails,
  PaymentInfo,
  SignatureData,
} from "@/types/invoice";

import {
  INITIAL_INVOICE_DATA,
  calculateTotals,
  saveDraft,
  loadDraft,
  clearDraft,
  createEmptyItem,
} from "@/lib/invoice/validation";
import { loadPaymentInfoFromConfig } from "@/lib/invoice/paymentUtils";
import { InvoiceServiceManager } from "./InvoiceServiceManager";
import { InvoiceAgencySettings } from "./InvoiceAgencySettings";
import { InvoiceSenderForm } from "./InvoiceSenderForm";
import { InvoiceReceiverForm } from "./InvoiceReceiverForm";
import { InvoiceDetailsForm } from "./InvoiceDetailsForm";
import { InvoiceItemsTable } from "./InvoiceItemsTable";
import { InvoiceChargesForm } from "./InvoiceChargesForm";
import { InvoiceFooterForm } from "./InvoiceFooterForm";
import { InvoicePdfActions } from "./pdf/InvoicePdfActions";
import { InvoiceLivePreview } from "./InvoiceLivePreview";
import { InvoiceSavedList } from "./InvoiceSavedList";

export function InvoicePage() {
  const [data, setData] = useState<InvoiceData>(INITIAL_INVOICE_DATA);
  const [loaded, setLoaded] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch agency config from DB
  const { data: agencyConfig } = useQuery<Record<string, string>>({
    queryKey: ["agency-config"],
    queryFn: async () => {
      const res = await fetch("/api/agency-config");
      if (!res.ok) return {};
      const json = await res.json();
      return json.data ?? {};
    },
    staleTime: 60_000,
  });

  // Load draft from localStorage on mount, apply agency sender + payment template from DB
  useEffect(() => {
    if (!agencyConfig) return;

    let sender = INITIAL_INVOICE_DATA.sender;
    try {
      const s = JSON.parse(agencyConfig.sender ?? "{}");
      sender = { name: s.name ?? "", address: s.address ?? "", city: s.city ?? "", zipCode: s.zipCode ?? "", country: s.country ?? "", email: s.email ?? "", phone: s.phone ?? "", customInputs: [] };
    } catch { /* use fallback */ }

    const defaultLogo = agencyConfig.default_logo ?? "";
    const defaultTheme = agencyConfig.default_theme_color ?? "#475569";

    // Build prefilled payment info from agency config (structured or parsed from free-text)
    const defaultPaymentInfo = loadPaymentInfoFromConfig(agencyConfig, "local");

    const draft = loadDraft();
    if (draft) {
      setData({
        ...INITIAL_INVOICE_DATA,
        ...draft,
        sender,
        details: {
          ...INITIAL_INVOICE_DATA.details,
          ...draft.details,
          invoiceLogo: draft.details?.invoiceLogo || defaultLogo,
          themeColor: draft.details?.themeColor || defaultTheme,
          paymentInfo: draft.details?.paymentInfo ?? defaultPaymentInfo,
          noteToCustomer: "",
        },
      });
    } else {
      setData((prev) => ({
        ...prev,
        sender,
        details: {
          ...prev.details,
          invoiceLogo: defaultLogo,
          themeColor: defaultTheme,
          paymentInfo: prev.details.paymentInfo ?? defaultPaymentInfo,
          noteToCustomer: "",
        },
      }));
    }
    setLoaded(true);
  }, [agencyConfig]);

  // Debounced auto-save
  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveDraft(data), 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [data, loaded]);

  // Recalculate totals when items or charges change
  useEffect(() => {
    const { subTotal, totalAmount } = calculateTotals(
      data.details.items,
      data.details.discountDetails,
      data.details.taxDetails,
      data.details.shippingDetails
    );
    if (subTotal !== data.details.subTotal || totalAmount !== data.details.totalAmount) {
      setData((prev) => ({
        ...prev,
        details: { ...prev.details, subTotal, totalAmount },
      }));
    }
  }, [data.details.items, data.details.discountDetails, data.details.taxDetails, data.details.shippingDetails]);

  const updateSender = useCallback((sender: InvoiceSender) => {
    setData((prev) => ({ ...prev, sender }));
  }, []);

  const updateReceiver = useCallback((receiver: InvoiceReceiver) => {
    setData((prev) => ({ ...prev, receiver }));
  }, []);

  const updateDetails = useCallback((field: string, value: string) => {
    setData((prev) => ({
      ...prev,
      details: { ...prev.details, [field]: value },
    }));
  }, []);

  const updateItems = useCallback((items: InvoiceItem[]) => {
    setData((prev) => ({ ...prev, details: { ...prev.details, items } }));
  }, []);

  const addItem = useCallback(() => {
    setData((prev) => ({
      ...prev,
      details: { ...prev.details, items: [...prev.details.items, createEmptyItem()] },
    }));
  }, []);

  const removeItem = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      details: { ...prev.details, items: prev.details.items.filter((item) => item.id !== id) },
    }));
  }, []);

  const updateItem = useCallback(
    (id: string, field: keyof InvoiceItem, value: string | number) => {
      setData((prev) => ({
        ...prev,
        details: {
          ...prev.details,
          items: prev.details.items.map((item) => {
            if (item.id !== id) return item;
            const updated = { ...item, [field]: value };
            if (field === "quantity" || field === "unitPrice") {
              updated.total = Math.round(updated.quantity * updated.unitPrice * 100) / 100;
            }
            return updated;
          }),
        },
      }));
    },
    []
  );

  const addPresetItem = useCallback((item: InvoiceItem) => {
    setData((prev) => ({
      ...prev,
      details: { ...prev.details, items: [...prev.details.items, item] },
    }));
  }, []);

  const updateDiscount = useCallback((discount: DiscountDetails | null) => {
    setData((prev) => ({ ...prev, details: { ...prev.details, discountDetails: discount } }));
  }, []);

  const updateTax = useCallback((tax: TaxDetails | null) => {
    setData((prev) => ({ ...prev, details: { ...prev.details, taxDetails: tax } }));
  }, []);

  const updateShipping = useCallback((shipping: ShippingDetails | null) => {
    setData((prev) => ({ ...prev, details: { ...prev.details, shippingDetails: shipping } }));
  }, []);

  const updatePaymentInfo = useCallback((paymentInfo: PaymentInfo | null) => {
    setData((prev) => ({ ...prev, details: { ...prev.details, paymentInfo } }));
  }, []);

  const updateNotes = useCallback((additionalNotes: string) => {
    setData((prev) => ({ ...prev, details: { ...prev.details, additionalNotes } }));
  }, []);

  const updateNoteToCustomer = useCallback((noteToCustomer: string) => {
    setData((prev) => ({ ...prev, details: { ...prev.details, noteToCustomer } }));
  }, []);

  const updatePaymentTerms = useCallback((paymentTerms: string) => {
    setData((prev) => ({ ...prev, details: { ...prev.details, paymentTerms } }));
  }, []);

  const updateSignature = useCallback((signature: SignatureData | null) => {
    setData((prev) => ({ ...prev, details: { ...prev.details, signature } }));
  }, []);

  const updateTotalInWords = useCallback((totalInWords: boolean) => {
    setData((prev) => ({ ...prev, details: { ...prev.details, totalInWords } }));
  }, []);

  const handleNewInvoice = () => {
    if (confirmReset) {
      if (resetTimer.current) clearTimeout(resetTimer.current);
      setData({ ...INITIAL_INVOICE_DATA, sender: data.sender, details: { ...INITIAL_INVOICE_DATA.details, items: [createEmptyItem()] } });
      clearDraft();
      setConfirmReset(false);
    } else {
      setConfirmReset(true);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setConfirmReset(false), 3000);
    }
  };

  const handleLoadInvoice = (invoiceData: InvoiceData) => {
    setData({
      ...INITIAL_INVOICE_DATA,
      ...invoiceData,
      sender: data.sender,
      details: {
        ...INITIAL_INVOICE_DATA.details,
        ...invoiceData.details,
      },
    });
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Left column: Form */}
        <div className="xl:col-span-3 space-y-6">
          <InvoiceDetailsForm
            logo={data.details.invoiceLogo}
            invoiceNumber={data.details.invoiceNumber}
            invoiceDate={data.details.invoiceDate}
            dueDate={data.details.dueDate}
            terms={data.details.terms}
            currency={data.details.currency}
            themeColor={data.details.themeColor}
            onChange={updateDetails}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InvoiceSenderForm sender={data.sender} onChange={updateSender} />
            <InvoiceReceiverForm receiver={data.receiver} onChange={updateReceiver} />
          </div>

          <InvoiceItemsTable
            items={data.details.items}
            currency={data.details.currency}
            onUpdateItem={updateItem}
            onAddItem={addItem}
            onAddPreset={addPresetItem}
            onRemoveItem={removeItem}
            onUpdateItems={updateItems}
          />

          <InvoiceChargesForm
            discount={data.details.discountDetails}
            tax={data.details.taxDetails}
            shipping={data.details.shippingDetails}
            currency={data.details.currency}
            onDiscountChange={updateDiscount}
            onTaxChange={updateTax}
            onShippingChange={updateShipping}
          />

          <InvoiceFooterForm
            paymentInfo={data.details.paymentInfo}
            additionalNotes={data.details.additionalNotes}
            noteToCustomer={data.details.noteToCustomer}
            paymentTerms={data.details.paymentTerms}
            signature={data.details.signature}
            totalInWords={data.details.totalInWords}
            subTotal={data.details.subTotal}
            totalAmount={data.details.totalAmount}
            discount={data.details.discountDetails}
            tax={data.details.taxDetails}
            shipping={data.details.shippingDetails}
            currency={data.details.currency}
            agencyConfig={agencyConfig}
            onPaymentInfoChange={updatePaymentInfo}
            onNotesChange={updateNotes}
            onNoteToCustomerChange={updateNoteToCustomer}
            onPaymentTermsChange={updatePaymentTerms}
            onSignatureChange={updateSignature}
            onTotalInWordsChange={updateTotalInWords}
          />
        </div>

        {/* Right column: Preview + Actions */}
        <div className="xl:col-span-2">
          <div className="sticky top-6 space-y-4">
            <InvoicePdfActions
              data={data}
              onNewInvoice={handleNewInvoice}
              onOpenSaved={() => setSavedOpen(true)}
            />

            {confirmReset && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                <p className="text-xs text-amber-600 font-medium">
                  Click &quot;New&quot; again to confirm. Unsaved changes will be lost.
                </p>
              </div>
            )}

            <button
              onClick={handleNewInvoice}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
              {confirmReset ? "Confirm Reset" : "Reset Invoice"}
            </button>

            {/* Service Manager */}
            <InvoiceServiceManager />
            <InvoiceAgencySettings />

            {/* Live Preview */}
            <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card overflow-hidden">
              <div className="border-b border-border/50 px-4 py-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Live Preview
                </p>
              </div>
              <InvoiceLivePreview data={data} />
            </div>
          </div>
        </div>
      </div>

      {/* Saved invoices modal */}
      <InvoiceSavedList
        open={savedOpen}
        onClose={() => setSavedOpen(false)}
        onLoad={handleLoadInvoice}
        onImport={handleLoadInvoice}
      />
    </>
  );
}
