"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Maximize2, RotateCcw } from "lucide-react";
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
import { QueryErrorState } from "@/components/shared/QueryErrorState";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { cn } from "@/lib/utils";

/**
 * A click-to-open chunk, memoized like loadPdfKit: one fetch per page load,
 * and a failed load is dropped so the next click tries again.
 */
function lazyChunk<T>(load: () => Promise<T>): () => Promise<T> {
  let chunk: Promise<T> | null = null;
  return () => {
    if (!chunk) {
      chunk = load();
      chunk.catch(() => {
        chunk = null;
      });
    }
    return chunk;
  };
}

// Click-to-open: the preview dialog and the saved list (a Radix Dialog) stay
// out of the page's first load. Loaded by hand, not next/dynamic: a failed
// chunk (a tab left open across a deploy, a flaky network) must leave the
// editor standing with a notice — next/dynamic throws it into the error
// boundary — and the next click must be able to retry.
const loadPreviewDialog = lazyChunk(() => import("./InvoicePreviewDialog").then((m) => m.InvoicePreviewDialog));
const loadSavedList = lazyChunk(() => import("./InvoiceSavedList").then((m) => m.InvoiceSavedList));
type PreviewDialogComponent = Awaited<ReturnType<typeof loadPreviewDialog>>;
type SavedListComponent = Awaited<ReturnType<typeof loadSavedList>>;

/** Hover/focus warm-up: the click reports a failure, the warm-up doesn't. */
const warmPreviewDialog = () => void loadPreviewDialog().catch(() => {});
const warmSavedList = () => void loadSavedList().catch(() => {});

/**
 * Today in the business timezone (Pacific), yyyy-mm-dd — what
 * lib/businessTime's businessTodayYmd returns in the browser (its
 * BILLING_TIME_ZONE override is server-only). Inlined because importing that
 * module ships webpack's `process` polyfill (~1 kB) with this page.
 */
function businessTodayYmd(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const chunkFailed = (what: string) =>
  `Couldn't open ${what} — check your connection and try again. If it keeps failing, reload the page (your draft is saved).`;

export function InvoicePage() {
  const [data, setData] = useState<InvoiceData>(INITIAL_INVOICE_DATA);
  const [loaded, setLoaded] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [previewMode, setPreviewMode] = useState<null | "live" | "pdf">(null);
  const [itemsNotice, setItemsNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [PreviewDialog, setPreviewDialog] = useState<PreviewDialogComponent | null>(null);
  const [SavedList, setSavedList] = useState<SavedListComponent | null>(null);
  const [chunkError, setChunkError] = useState<string | null>(null);
  // The edit the debounced autosave hasn't written yet (flushed on unmount).
  const pendingSave = useRef<InvoiceData | null>(null);
  const seeded = useRef(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch agency config from DB
  const {
    data: agencyConfig,
    isError: configFailed,
    isFetching: configFetching,
    refetch: refetchConfig,
  } = useQuery<Record<string, string>>({
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
        // The business (Pacific) day — UTC is already tomorrow on Pacific evenings.
        invoiceDate: businessTodayYmd(),
        invoiceLogo: agencyConfig?.default_logo ?? "",
        themeColor: agencyConfig?.default_theme_color ?? "#475569",
        paymentInfo: loadPaymentInfoFromConfig(agencyConfig, "local"),
        noteToCustomer: "",
      },
    };
  }, [agencyConfig]);

  // On mount (once agency settings load), restore the saved draft if present —
  // otherwise start from the agency defaults. ONCE: a later agency-config
  // refetch (Save Settings, a window refocus) must not re-seed — that replaced
  // the sender, cleared Note to Customer and rolled back to the last autosave.
  // "Reset Invoice" picks up the newest settings via buildDefaultInvoice.
  useEffect(() => {
    if (!agencyConfig || seeded.current) return;
    seeded.current = true;
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
    pendingSave.current = data;
    const timer = setTimeout(() => {
      pendingSave.current = null;
      saveDraft(data);
    }, 500);
    return () => clearTimeout(timer);
  }, [data, loaded]);

  // Leaving the page (or the tab) inside the debounce window writes the last
  // edit now instead of dropping it.
  useEffect(() => {
    const flush = () => {
      if (!pendingSave.current) return;
      saveDraft(pendingSave.current);
      pendingSave.current = null;
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

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

  // Open first, then load: the loading overlay covers the wait, and a failed
  // chunk closes it again with a notice instead of crashing the page.
  const openPreview = (mode: "live" | "pdf") => {
    setChunkError(null);
    setPreviewMode(mode);
    if (PreviewDialog) return;
    loadPreviewDialog().then(
      (C) => setPreviewDialog(() => C),
      () => {
        setPreviewMode(null);
        setChunkError(chunkFailed("the preview"));
      }
    );
  };

  const openSaved = () => {
    setChunkError(null);
    setSavedOpen(true);
    if (SavedList) return;
    loadSavedList().then(
      (C) => setSavedList(() => C),
      () => {
        setSavedOpen(false);
        setChunkError(chunkFailed("the saved invoices"));
      }
    );
  };

  if (!loaded) {
    // The editor seeds from the agency settings — without them it can't start.
    if (configFailed && !configFetching) {
      return (
        <QueryErrorState
          title="Couldn't load the invoice settings"
          message="The agency's sender, logo and payment details didn't load. Check your connection and retry."
          onRetry={() => void refetchConfig()}
        />
      );
    }
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
                onOpenSaved={openSaved}
                onPreview={() => openPreview("pdf")}
                onWarmPreview={warmPreviewDialog}
                onWarmSaved={warmSavedList}
              />

              {chunkError && (
                <p role="alert" className={cn(INVOICE_NOTICE, badgeTone.danger)}>
                  {chunkError}
                </p>
              )}

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
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => openPreview("live")}
                  onPointerEnter={warmPreviewDialog}
                  onFocus={warmPreviewDialog}
                >
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

      {previewMode &&
        (PreviewDialog ? (
          <PreviewDialog data={data} initialMode={previewMode} onClose={() => setPreviewMode(null)} />
        ) : (
          <ChunkLoading label="Opening preview…" dark onCancel={() => setPreviewMode(null)} />
        ))}

      {/* Saved invoices modal — mounted only while open (lazy chunk). */}
      {savedOpen &&
        (SavedList ? (
          <SavedList
            open={savedOpen}
            onClose={() => setSavedOpen(false)}
            onLoad={handleLoadInvoice}
            onImport={handleLoadInvoice}
          />
        ) : (
          <ChunkLoading label="Opening saved invoices…" onCancel={() => setSavedOpen(false)} />
        ))}
    </>
  );
}

/**
 * Stands in for a click-to-open dialog while its chunk loads (a warm-up on
 * hover usually beats the click, so this only shows on a slow link — it fades
 * in after a beat to avoid a flash). Escape or a click outside cancels.
 */
function ChunkLoading({ label, dark, onCancel }: { label: string; dark?: boolean; onCancel: () => void }) {
  useEscapeKey(onCancel);
  const overlay = (
    <div
      // dialogOverlayClass's look, spelled out: importing it from ui/dialog
      // would put the Radix Dialog runtime into this page's first load.
      className={cn(
        "fixed inset-0 z-[80] flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in-0 fill-mode-both delay-150 duration-200",
        dark ? "bg-black/70" : "bg-black/30"
      )}
      onClick={onCancel}
    >
      <p
        role="status"
        className="flex items-center gap-2 rounded-full bg-popover px-4 py-2 text-sm text-popover-foreground shadow-xl"
      >
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        {label}
      </p>
    </div>
  );
  return typeof document === "undefined" ? overlay : createPortal(overlay, document.body);
}

/** Mirrors the page while the agency settings (and the draft) load. */
function InvoicePageSkeleton() {
  return (
    <div aria-busy="true" role="status">
      <span className="sr-only">Loading invoice…</span>
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
