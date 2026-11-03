"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileUp, Loader2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { dialogOverlayClass, dialogPanelClass } from "@/components/ui/dialog";
import { createSopRequest } from "@/hooks/useSops";
import { useEscapeKey } from "@/hooks/useEscapeKey";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT =
  ".pdf,.docx,.md,.markdown,.txt,.html,.htm,.csv,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/*";
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Hand-built (not Radix Dialog) because it must stay open — no Escape, no
// overlay click, no close button — while an import is running.

export function ImportSopDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const headingId = useId();

  useEscapeKey(() => {
    if (!busy) onClose();
  }, open);

  // Focus moves into the dialog on open and back to whatever opened it on
  // close; Tab wraps inside it (focus that slipped out — e.g. off a button
  // disabled mid-import — is pulled back in).
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      const panel = panelRef.current;
      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.getClientRects().length > 0
      );
      const active = document.activeElement;
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (!panel.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  function pick(f: File | null) {
    setErr("");
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setErr("File exceeds the 10 MB limit.");
      return;
    }
    setFile(f);
  }

  async function handleImport() {
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/sops/import", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json.error || "Import failed");
        return;
      }
      const created = await createSopRequest({ doc: json.data.doc, folder: "Imported" });
      queryClient.invalidateQueries({ queryKey: ["sops"] });
      onImported(created.id);
    } catch {
      setErr("Import failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby={headingId}>
      <div className={dialogOverlayClass} onClick={busy ? undefined : onClose} aria-hidden />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(dialogPanelClass, "relative z-50 w-full max-w-md max-h-[85dvh] overflow-y-auto overscroll-contain p-6 outline-none")}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id={headingId} className="text-base font-semibold tracking-tight text-foreground">Import a document</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload a PDF, Word doc, Notion export, Markdown, HTML, or text file. It&apos;s converted
              into an editable SOP — instantly, no AI.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            disabled={busy}
            className="shrink-0 text-muted-foreground"
            aria-label="Close"
          >
            <X />
          </Button>
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={cn(
            "mt-5 flex w-full flex-col items-center justify-center gap-2 rounded-3xl border border-dashed px-4 py-8 text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:opacity-60",
            file ? "border-foreground/30 bg-muted/50 text-foreground" : "text-muted-foreground hover:border-foreground/30 hover:bg-muted/30"
          )}
        >
          {file ? <FileUp className="size-6 text-foreground" /> : <Upload className="size-6" />}
          <span className="max-w-full truncate font-medium">{file ? file.name : "Choose a file"}</span>
          <span className="text-xs text-muted-foreground">PDF, Word, Markdown, HTML, or text · up to 10 MB</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            pick(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />

        <p className="mt-3 rounded-2xl bg-muted/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          Headings become sections, numbered lists become step blocks, and checklists/quotes are
          preserved. You can refine everything in the builder after importing. To draft a brand-new
          SOP with AI instead, use the <span className="font-medium text-foreground">AI Assistant</span> tab.
        </p>

        {err && <p role="alert" className="mt-3 text-xs text-destructive">{err}</p>}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={handleImport} disabled={!file || busy}>
            {busy ? <Loader2 className="animate-spin" /> : <FileUp />}
            {busy ? "Converting…" : "Import & open"}
          </Button>
        </div>
      </div>
    </div>
  );
}
