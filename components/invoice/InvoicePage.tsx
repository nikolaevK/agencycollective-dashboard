"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
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
import { INVOICE_NOTICE } from "./InvoiceField";
import { badgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Click-to-open: the preview dialog pulls in react-pdf (~500 kB) and the saved
// list a Radix Dialog — neither belongs in the page's first load.
const InvoicePreviewDialog = dynamic(
  () => import("./InvoicePreviewDialog").then((m) => m.InvoicePreviewDialog),
  { ssr: false }
);
const InvoiceSavedList = dynamic(() => import("./InvoiceSavedList").then((m) => m.InvoiceSavedList), {
  ssr: false,
});

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
    return <InvoicePageSkeleton />;
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        {/* Left column: Form */}
        <div className="min-w-0 space-y-6 xl:col-span-3">
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

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <InvoiceSenderForm sender={data.sender} onChange={updateSender} />
            <InvoiceReceiverForm receiver={data.receiver} onChange={updateReceiver} />
          </div>

          {/* overflow-visible: the preset-service picker opens below the editor. */}
          <Card className="overflow-visible">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle>Line Items</CardTitle>
              <CardDescription className="text-xs tabular-nums">
                {data.details.items.length} line{data.details.items.length !== 1 ? "s" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                  className={cn(INVOICE_NOTICE, itemsNotice.type === "success" ? badgeTone.success : badgeTone.danger)}
                >
                  {itemsNotice.text}
                </p>
              )}
            </CardContent>
          </Card>

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
        <div className="min-w-0 xl:col-span-2">
          <div className="space-y-4 xl:sticky xl:top-6 xl:flex xl:h-[calc(100vh-3rem)] xl:flex-col xl:gap-4 xl:space-y-0">
            {/* -m-1 p-1: the scroll box must not clip the card's ring. */}
            <div className="shrink-0 space-y-3 xl:-m-1 xl:max-h-[55%] xl:overflow-y-auto xl:p-1">
              <InvoicePdfActions
                data={data}
                onNewInvoice={handleNewInvoice}
                onOpenSaved={() => setSavedOpen(true)}
                onPreview={() => setPreviewMode("pdf")}
              />

              {confirmReset && (
                <p role="status" className={cn(INVOICE_NOTICE, badgeTone.warning)}>
                  Click &quot;New&quot; again to confirm. Unsaved changes will be lost.
                </p>
              )}

              <Button
                type="button"
                variant={confirmReset ? "destructive" : "outline"}
                onClick={handleNewInvoice}
                className="w-full"
              >
                <RotateCcw />
                {confirmReset ? "Confirm Reset" : "Reset Invoice"}
              </Button>
            </div>

            {/* Live Preview */}
            <Card className="flex min-h-[320px] flex-col xl:min-h-0 xl:flex-1">
              <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Live Preview
                </p>
                <Button type="button" variant="ghost" size="xs" onClick={() => setPreviewMode("live")}>
                  <Maximize2 />
                  Full screen
                </Button>
              </div>
              {/* Stable gutter: a toggling scrollbar would change the width the
                  preview scales to and loop (see InvoiceLivePreview). */}
              <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 p-3 [scrollbar-gutter:stable]">
                <div className="overflow-hidden rounded-sm shadow-md ring-1 ring-black/5">
                  <InvoiceLivePreview data={data} />
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {previewMode && (
        <InvoicePreviewDialog data={data} initialMode={previewMode} onClose={() => setPreviewMode(null)} />
      )}

      {/* Saved invoices modal — mounted only while open (lazy chunk). */}
      {savedOpen && (
        <InvoiceSavedList
          open={savedOpen}
          onClose={() => setSavedOpen(false)}
          onLoad={handleLoadInvoice}
          onImport={handleLoadInvoice}
        />
      )}
    </>
  );
}

/** Mirrors the page while the agency settings (and the draft) load. */
function InvoicePageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading invoice">
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-3xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-3">
          <Skeleton className="h-64 w-full rounded-3xl" />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Skeleton className="h-96 w-full rounded-3xl" />
            <Skeleton className="h-96 w-full rounded-3xl" />
          </div>
          <Skeleton className="h-48 w-full rounded-3xl" />
        </div>
        <div className="space-y-4 xl:col-span-2">
          <Skeleton className="h-72 w-full rounded-3xl" />
          <Skeleton className="h-[420px] w-full rounded-3xl" />
        </div>
      </div>
    </div>
  );
}
