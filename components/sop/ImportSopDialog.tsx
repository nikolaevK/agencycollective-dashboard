"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileUp, Loader2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createSopRequest } from "@/hooks/useSops";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT =
  ".pdf,.docx,.md,.markdown,.txt,.html,.htm,.csv,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/*";

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={busy ? undefined : onClose} aria-hidden />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-foreground">Import a document</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Upload a PDF, Word doc, Notion export, Markdown, HTML, or text file. It&apos;s converted
              into an editable SOP — instantly, no AI.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={cn(
            "mt-4 flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-sm transition-colors",
            file ? "border-primary/50 bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:border-primary/40"
          )}
        >
          {file ? <FileUp className="h-6 w-6 text-primary" /> : <Upload className="h-6 w-6" />}
          <span className="font-medium">{file ? file.name : "Choose a file"}</span>
          <span className="text-[11px] text-muted-foreground">PDF, Word, Markdown, HTML, or text · up to 10 MB</span>
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

        <p className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          Headings become sections, numbered lists become step blocks, and checklists/quotes are
          preserved. You can refine everything in the builder after importing. To draft a brand-new
          SOP with AI instead, use the <span className="font-medium text-foreground">AI Assistant</span> tab.
        </p>

        {err && <p className="mt-2 text-xs text-destructive">{err}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!file || busy}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white ac-gradient hover:opacity-90 active:scale-95 transition-all disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            {busy ? "Converting…" : "Import & open"}
          </button>
        </div>
      </div>
    </div>
  );
}
