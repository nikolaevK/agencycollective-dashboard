"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { pdf } from "@react-pdf/renderer";
import { Download, ExternalLink, FileText, Loader2, Monitor, X, ZoomIn, ZoomOut } from "lucide-react";
import { InvoiceLivePreview } from "@/components/invoice/InvoiceLivePreview";
import { InvoicePdfDocument } from "@/components/invoice/pdf/InvoicePdfTemplate";
import { Button } from "@/components/ui/button";
import { dialogOverlayClass } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import type { InvoiceData } from "@/types/invoice";
import { cn } from "@/lib/utils";

type Mode = "live" | "pdf";

// Page widths for the live view (CSS px). The HTML preview scales to its
// container, so zoom is just the container width.
const ZOOM_STEPS = [520, 680, 820, 1000, 1240];
const DEFAULT_ZOOM = 2;

/**
 * Whether a blob PDF renders usefully in an <iframe>: Android Chrome shows a
 * blank frame and iOS Safari only page 1. Touch-first devices (and browsers
 * reporting no built-in viewer) open in Live and get Open / Download in
 * Exact-PDF mode instead.
 */
function canInlinePdf(): boolean {
  if (typeof window === "undefined") return true;
  if (navigator.pdfViewerEnabled === false) return false;
  return !window.matchMedia("(pointer: coarse)").matches;
}

interface Props {
  data: InvoiceData;
  onClose: () => void;
  /** "pdf" renders the real PDF (exact pagination); "live" the instant HTML twin. */
  initialMode?: Mode;
  title?: string;
}

/**
 * Full-screen invoice preview. "Live" is the instant HTML twin of the PDF
 * with zoom; "Exact PDF" renders the actual document in-page — the true
 * multi-page output, with no popup (window.open after an await gets blocked
 * by Safari/Firefox).
 */
export function InvoicePreviewDialog({ data: liveData, onClose, initialMode = "live", title }: Props) {
  // Snapshot at open: the editor underneath can't change while this covers
  // it, and a fresh object from a parent re-render must not re-render the PDF.
  const [data] = useState(liveData);
  const [inlinePdf] = useState(canInlinePdf);
  const [mode, setMode] = useState<Mode>(initialMode === "pdf" && !inlinePdf ? "live" : initialMode);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const liveRef = useRef<HTMLDivElement>(null);
  const [fitW, setFitW] = useState<number | null>(null);

  useEscapeKey(onClose);

  // Width available to the live page (content box of its padded wrapper).
  useEffect(() => {
    const el = liveRef.current;
    if (mode !== "live" || !el) return;
    const ro = new ResizeObserver(([entry]) => setFitW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  // Render the PDF on demand, once per opened data snapshot.
  useEffect(() => {
    if (mode !== "pdf") return;
    let cancelled = false;
    let url: string | null = null;
    setPdfUrl(null);
    setPdfError(null);
    pdf(<InvoicePdfDocument data={data} />)
      .toBlob()
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setPdfUrl(url);
      })
      .catch((e) => {
        if (!cancelled) setPdfError(e instanceof Error ? e.message : "PDF generation failed");
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
      setPdfUrl(null); // no link may keep pointing at the revoked URL
    };
  }, [mode, data]);

  const fileName = `invoice-${data.details.invoiceNumber || "draft"}.pdf`;
  // Steps are page widths at 100% (= the default step). A view narrower than
  // that scales the ladder down so 100% fits and every step still changes the
  // size (each used to clamp to the screen width, so zoom did nothing on a
  // phone); a page wider than the view scrolls sideways.
  const pageW =
    fitW === null ? null : Math.round(ZOOM_STEPS[zoom] * Math.min(1, fitW / ZOOM_STEPS[DEFAULT_ZOOM]));

  // Rendered into <body> so it covers the invoice drawers (also body-level)
  // wherever it's opened from.
  const dialog = (
    <div className={cn(dialogOverlayClass, "z-[80] flex flex-col bg-black/70")} role="dialog" aria-modal="true" aria-label="Invoice preview">
      <div className="flex flex-wrap items-center gap-2 border-b bg-popover px-3 py-2 text-popover-foreground sm:px-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold tracking-tight text-foreground">{title ?? "Invoice preview"}</p>
          <p className="truncate text-xs text-muted-foreground">
            #{data.details.invoiceNumber || "draft"}
            {data.receiver.name ? ` · ${data.receiver.name}` : ""}
          </p>
        </div>

        <Tabs value={mode} onValueChange={(m) => setMode(m as Mode)}>
          <TabsList aria-label="Preview mode">
            {([
              ["live", "Live", Monitor],
              ["pdf", "Exact PDF", FileText],
            ] as const).map(([m, label, Icon]) => (
              <TabsTrigger key={m} value={m} className="text-xs">
                <Icon className="size-3.5" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {mode === "live" && (
          <div className="flex items-center gap-0.5 rounded-full border p-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => setZoom((z) => Math.max(0, z - 1))}
              disabled={zoom === 0}
              className="text-muted-foreground"
              aria-label="Zoom out"
            >
              <ZoomOut className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setZoom(DEFAULT_ZOOM)}
              className="min-w-[3rem] px-1 tabular-nums text-muted-foreground"
              title="Reset zoom"
            >
              {Math.round((ZOOM_STEPS[zoom] / ZOOM_STEPS[DEFAULT_ZOOM]) * 100)}%
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => setZoom((z) => Math.min(ZOOM_STEPS.length - 1, z + 1))}
              disabled={zoom === ZOOM_STEPS.length - 1}
              className="text-muted-foreground"
              aria-label="Zoom in"
            >
              <ZoomIn className="size-3.5" />
            </Button>
          </div>
        )}

        {mode === "pdf" && pdfUrl && (
          <Button asChild variant="outline" size="sm">
            <a href={pdfUrl} download={fileName}>
              <Download />
              Download
            </a>
          </Button>
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          className="text-muted-foreground"
          aria-label="Close preview"
        >
          <X />
        </Button>
      </div>

      {/* Stable gutter: the live page is sized from this scroller's width, so a
          scrollbar appearing/disappearing must not change it (resize loop). */}
      <div className="relative min-h-0 flex-1 overflow-auto overscroll-contain [scrollbar-gutter:stable]" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {mode === "live" ? (
          <div ref={liveRef} className="px-3 py-6 sm:px-6" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div
              className="mx-auto shadow-2xl"
              style={pageW === null ? { width: "100%", maxWidth: ZOOM_STEPS[zoom] } : { width: pageW }}
            >
              <InvoiceLivePreview data={data} />
            </div>
            <p className="mt-3 text-center text-[11px] text-white/60">
              Live view — page breaks may differ slightly from the PDF. Switch to Exact PDF to see the final pages.
            </p>
          </div>
        ) : pdfError ? (
          <div className="flex h-full items-center justify-center p-6">
            <p className="max-w-md rounded-2xl bg-popover px-4 py-3 text-sm text-destructive">PDF generation failed: {pdfError}</p>
          </div>
        ) : !pdfUrl ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-white/80" />
          </div>
        ) : !inlinePdf ? (
          <div className="flex h-full items-center justify-center p-6">
            <div className="max-w-sm space-y-3 rounded-3xl bg-popover px-5 py-4 text-center text-popover-foreground shadow-xl">
              <p className="text-sm text-foreground">This browser can&apos;t show the PDF here — open it or download it.</p>
              <div className="flex justify-center gap-2">
                <Button asChild>
                  <a href={pdfUrl} target="_blank" rel="noreferrer">
                    <ExternalLink />
                    Open PDF
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href={pdfUrl} download={fileName}>
                    <Download />
                    Download
                  </a>
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <iframe src={pdfUrl} title="Invoice PDF" className="h-full w-full bg-white" />
        )}
      </div>
    </div>
  );

  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}
