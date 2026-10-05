"use client";

import { useEffect, useRef, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { Download, ExternalLink, FileText, Loader2, Monitor, X, ZoomIn, ZoomOut } from "lucide-react";
import { InvoiceLivePreview } from "@/components/invoice/InvoiceLivePreview";
import { InvoicePdfDocument } from "@/components/invoice/pdf/InvoicePdfTemplate";
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

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Invoice preview">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-card px-3 py-2 sm:px-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{title ?? "Invoice preview"}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            #{data.details.invoiceNumber || "draft"}
            {data.receiver.name ? ` · ${data.receiver.name}` : ""}
          </p>
        </div>

        <div className="flex rounded-lg bg-muted/60 p-0.5" role="tablist" aria-label="Preview mode">
          {([
            ["live", "Live", Monitor],
            ["pdf", "Exact PDF", FileText],
          ] as const).map(([m, label, Icon]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {mode === "live" && (
          <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0, z - 1))}
              disabled={zoom === 0}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
              aria-label="Zoom out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(DEFAULT_ZOOM)}
              className="min-w-[3rem] rounded-md px-1 text-[11px] font-medium tabular-nums text-muted-foreground hover:text-foreground"
              title="Reset zoom"
            >
              {Math.round((ZOOM_STEPS[zoom] / ZOOM_STEPS[DEFAULT_ZOOM]) * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(ZOOM_STEPS.length - 1, z + 1))}
              disabled={zoom === ZOOM_STEPS.length - 1}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
              aria-label="Zoom in"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {mode === "pdf" && pdfUrl && (
          <a
            href={pdfUrl}
            download={fileName}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
        )}

        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close preview"
        >
          <X className="h-4 w-4" />
        </button>
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
            <p className="max-w-md rounded-lg bg-card px-4 py-3 text-sm text-destructive">PDF generation failed: {pdfError}</p>
          </div>
        ) : !pdfUrl ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-white/80" />
          </div>
        ) : !inlinePdf ? (
          <div className="flex h-full items-center justify-center p-6">
            <div className="max-w-sm space-y-3 rounded-lg bg-card px-5 py-4 text-center">
              <p className="text-sm text-foreground">This browser can&apos;t show the PDF here — open it or download it.</p>
              <div className="flex justify-center gap-2">
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open PDF
                </a>
                <a
                  href={pdfUrl}
                  download={fileName}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
                >
                  <Download className="h-4 w-4" />
                  Download
                </a>
              </div>
            </div>
          </div>
        ) : (
          <iframe src={pdfUrl} title="Invoice PDF" className="h-full w-full bg-white" />
        )}
      </div>
    </div>
  );
}
