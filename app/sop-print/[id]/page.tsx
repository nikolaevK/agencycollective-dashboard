"use client";

import { useEffect, useState } from "react";
import { Printer, Loader2 } from "lucide-react";
import { SopRenderer } from "@/components/sop/SopRenderer";
import type { SopDoc } from "@/lib/sop";

// The kit's default Button, as plain classes — this standalone page stays
// lean (no Radix Slot / cva / tailwind-merge for one button).
const PRINT_BUTTON =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-4xl border border-transparent bg-primary bg-clip-padding px-3 text-sm font-medium text-primary-foreground outline-none transition-all select-none hover:bg-primary/80 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

/**
 * Standalone print view (no dashboard shell). Renders the EXACT same
 * SopRenderer used in the builder canvas, then triggers the browser's native
 * print dialog → "Save as PDF". This guarantees the PDF matches the on-screen
 * preview and renders correctly (no @react-pdf layout quirks).
 */
export default function SopPrintPage({ params }: { params: { id: string } }) {
  const [doc, setDoc] = useState<SopDoc | null>(null);
  const [err, setErr] = useState("");

  // Force light theme for a clean printable page (root <html> defaults to dark).
  // The root ThemeProvider re-applies the stored theme in its own mount effect,
  // which runs AFTER this one (parents' effects follow their children's), so
  // keep `dark` off for as long as the page is mounted, not just once.
  useEffect(() => {
    const html = document.documentElement;
    const wasDark = html.classList.contains("dark");
    const stripDark = () => {
      if (html.classList.contains("dark")) html.classList.remove("dark");
    };
    stripDark();
    const observer = new MutationObserver(stripDark);
    observer.observe(html, { attributes: true, attributeFilter: ["class"] });
    return () => {
      observer.disconnect();
      if (wasDark) html.classList.add("dark");
    };
  }, []);

  useEffect(() => {
    fetch(`/api/admin/sops/${params.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => setDoc(j.data.doc as SopDoc))
      .catch((s) => setErr(s === 401 ? "Please log in to view this SOP." : "Failed to load this SOP."));
  }, [params.id]);

  // Auto-open the print dialog once content is on screen.
  useEffect(() => {
    if (!doc) return;
    const t = setTimeout(() => window.print(), 500);
    return () => clearTimeout(t);
  }, [doc]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print {
          html, body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Screen-only toolbar */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <span className="text-sm font-medium text-foreground">SOP → PDF</span>
        <button type="button" onClick={() => window.print()} disabled={!doc} className={PRINT_BUTTON}>
          <Printer />
          Print / Save as PDF
        </button>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        {err ? (
          <p className="py-20 text-center text-sm text-muted-foreground">{err}</p>
        ) : !doc ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Preparing PDF…
          </div>
        ) : (
          <SopRenderer doc={doc} />
        )}
      </div>
    </div>
  );
}
