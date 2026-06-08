"use client";

import { useEffect, useState } from "react";
import { Printer, Loader2 } from "lucide-react";
import { SopRenderer } from "@/components/sop/SopRenderer";
import type { SopDoc } from "@/lib/sop";

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
  useEffect(() => {
    const html = document.documentElement;
    const wasDark = html.classList.contains("dark");
    html.classList.remove("dark");
    return () => { if (wasDark) html.classList.add("dark"); };
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
    <div className="min-h-screen bg-white">
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print {
          html, body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Screen-only toolbar */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-white px-4 py-3">
        <span className="text-sm font-semibold text-foreground">SOP → PDF</span>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!doc}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white ac-gradient hover:opacity-90 disabled:opacity-40"
        >
          <Printer className="h-4 w-4" />
          Print / Save as PDF
        </button>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-8">
        {err ? (
          <p className="py-20 text-center text-sm text-muted-foreground">{err}</p>
        ) : !doc ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Preparing PDF…
          </div>
        ) : (
          <SopRenderer doc={doc} />
        )}
      </div>
    </div>
  );
}
