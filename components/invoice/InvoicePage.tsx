"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Maximize2, RotateCcw } from "lucide-react";
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
import { InvoiceAgencyProfiles } from "./InvoiceAgencyProfiles";
import type { AgencyProfileRecord } from "@/lib/invoiceAgencyProfiles";
import { InvoiceSenderForm } from "./InvoiceSenderForm";
import { InvoiceReceiverForm } from "./InvoiceReceiverForm";
import { InvoiceDetailsForm } from "./InvoiceDetailsForm";
import { LineItemsEditor } from "./LineItemsEditor";
import { InvoiceChargesForm } from "./InvoiceChargesForm";
import { InvoiceFooterForm } from "./InvoiceFooterForm";
import { InvoicePdfActions } from "./pdf/InvoicePdfActions";
import { InvoiceLivePreview } from "./InvoiceLivePreview";
import { InvoicePreviewDialog } from "./InvoicePreviewDialog";
import { InvoiceSavedList } from "./InvoiceSavedList";

export function InvoicePage() {
  const [data, setData] = useState<InvoiceData>(INITIAL_INVOICE_DATA);
  const [loaded, setLoaded] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [previewMode, setPreviewMode] = useState<null | "live" | "pdf">(null);
  const [itemsNotice, setItemsNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch agency config from DB
  const { data: agencyConfig } = useQuery<Record<string, string>>({
    queryKey: ["agency-config"],
    queryFn: async () => {
      const res = await fetch("/api/admin/agency-config");
      if (!res.ok) return {};
      const json = await res.json();
      return json.data ?? {};
    },
    staleTime: 60_000,
  });

  // Build a fresh invoice pre-filled from the saved agency settings — the agency
  // sender, default logo, theme colour and (local) payment template. Shared by
  // initial load and "Reset Invoice" so both start from the same defaults.
  // Falls back to blank INITIAL_INVOICE_DATA values until agencyConfig loads.
  const buildDefaultInvoice = useCallback((): InvoiceData => {
    let sender = INITIAL_INVOICE_DATA.sender;
    if (agencyConfig) {
      try {
        const s = JSON.parse(agencyConfig.sender ?? "{}");
        sender = { name: s.name ?? "", address: s.address ?? "", city: s.city ?? "", zipCode: s.zipCode ?? "", country: s.country ?? "", email: s.email ?? "", phone: s.phone ?? "", customInputs: [] };
      } catch { /* use fallback */ }
    }
    return {
      ...INITIAL_INVOICE_DATA,
      sender,
      receiver: { ...INITIAL_INVOICE_DATA.receiver },
      details: {
        ...INITIAL_INVOICE_DATA.details,
        items: [createEmptyItem()],
        invoiceDate: new Date().toISOString().slice(0, 10),
        invoiceLogo: agencyConfig?.default_logo ?? "",
        themeColor: agencyConfig?.default_theme_color ?? "#475569",
        paymentInfo: loadPaymentInfoFromConfig(agencyConfig, "local"),
        noteToCustomer: "",
      },
    };
  }, [agencyConfig]);

  // On mount (once agency settings load), restore the saved draft if present —
  // otherwise start from the agency defaults.
  useEffect(() => {
    if (!agencyConfig) return;
    const base = buildDefaultInvoice();
    const draft = loadDraft();
    if (draft) {
      setData({
        ...base,
        ...draft,
        sender: base.sender,
        details: {
          ...base.details,
          ...draft.details,
          invoiceLogo: draft.details?.invoiceLogo || base.details.invoiceLogo,
          themeColor: draft.details?.themeColor || base.details.themeColor,
          paymentInfo: draft.details?.paymentInfo ?? base.details.paymentInfo,
          noteToCustomer: "",
        },
      });
    } else {
      setData(base);
    }
    setLoaded(true);
  }, [agencyConfig, buildDefaultInvoice]);

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

  // Apply a saved agency profile (logo, sender, theme, payment) onto the draft.
  // Respects the currently-selected payment type so the right template loads.
  const applyProfile = useCallback((profile: AgencyProfileRecord) => {
    setData((prev) => {
      const type = prev.details.paymentInfo?.paymentType ?? "local";
      const template = type === "international" ? profile.paymentInternational : profile.paymentLocal;
      // Only adopt the profile's payment block if it actually has details —
      // otherwise applying a profile with no payment template would surface an
      // empty "Payment Information" section. Keep the current block if blank.
      const hasPaymentContent = Object.entries(template).some(
        ([k, v]) => k !== "paymentType" && typeof v === "string" && v.trim() !== ""
      );
      return {
        ...prev,
        sender: { ...profile.sender, customInputs: prev.sender.customInputs },
        details: {
          ...prev.details,
          invoiceLogo: profile.logo || prev.details.invoiceLogo,
          themeColor: profile.themeColor || prev.details.themeColor,
          paymentInfo: hasPaymentContent ? { ...template, paymentType: type } : prev.details.paymentInfo,
        },
      };
    });
  }, []);

  const handleNewInvoice = () => {
    if (confirmReset) {
      if (resetTimer.current) clearTimeout(resetTimer.current);
      // Reset to the default agency settings, everything pre-filled.
      setData(buildDefaultInvoice());
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
      {/* Invoice-wide settings (presets, agency defaults, saved profiles).
          These used to sit in the sticky preview column — expanding one
          pushed the live preview below the fold where it couldn't be
          scrolled to. */}
      <div className="mb-6 grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <InvoiceServiceManager />
        <InvoiceAgencySettings />
        <InvoiceAgencyProfiles onApply={applyProfile} />
      </div>

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

          <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                Line Items
              </h3>
              <span className="text-xs text-muted-foreground">
                {data.details.items.length} line{data.details.items.length !== 1 ? "s" : ""}
              </span>
            </div>
            <LineItemsEditor
              items={data.details.items}
              currency={data.details.currency}
              onChange={updateItems}
              allowSavePreset
              onNotice={setItemsNotice}
            />
            {itemsNotice && (
              <p
                role="status"
                className={itemsNotice.type === "success" ? "text-xs text-emerald-600" : "text-xs text-destructive"}
              >
                {itemsNotice.text}
              </p>
            )}
          </div>

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

        {/* Right column: Actions + Preview. Sticky and exactly one viewport
            tall on desktop — the preview scrolls inside, so a long invoice
            is never cut off below the fold. A definite height (not just
            max-h) so the actions block's 55% cap resolves. */}
        <div className="xl:col-span-2">
          <div className="space-y-4 xl:sticky xl:top-6 xl:flex xl:h-[calc(100vh-3rem)] xl:flex-col xl:space-y-0 xl:gap-4">
            <div className="shrink-0 space-y-3 xl:max-h-[55%] xl:overflow-y-auto">
              <InvoicePdfActions
                data={data}
                onNewInvoice={handleNewInvoice}
                onOpenSaved={() => setSavedOpen(true)}
                onPreview={() => setPreviewMode("pdf")}
              />

              {confirmReset && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                  <p className="text-xs text-amber-600 font-medium">
                    Click &quot;New&quot; again to confirm. Unsaved changes will be lost.
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={handleNewInvoice}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <RotateCcw className="h-4 w-4" />
                {confirmReset ? "Confirm Reset" : "Reset Invoice"}
              </button>
            </div>

            {/* Live Preview */}
            <div className="flex min-h-[320px] flex-col overflow-hidden rounded-xl border border-border/50 dark:border-white/[0.06] bg-card xl:min-h-0 xl:flex-1">
              <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-4 py-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Live Preview
                </p>
                <button
                  type="button"
                  onClick={() => setPreviewMode("live")}
                  className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <Maximize2 className="h-3 w-3" />
                  Full screen
                </button>
              </div>
              {/* Stable gutter: a toggling scrollbar would change the width the
                  preview scales to and loop (see InvoiceLivePreview). */}
              <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 p-3 [scrollbar-gutter:stable]">
                <div className="overflow-hidden rounded-sm shadow-md ring-1 ring-black/5">
                  <InvoiceLivePreview data={data} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {previewMode && (
        <InvoicePreviewDialog data={data} initialMode={previewMode} onClose={() => setPreviewMode(null)} />
      )}

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
