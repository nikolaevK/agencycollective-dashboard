"use client";

import { useState } from "react";
import { X, Upload, Loader2, FileSpreadsheet, CheckCircle2 } from "lucide-react";

interface ImportSummary {
  imported: number;
  skippedDuplicate: number;
  skippedEmpty: number;
  totalRows: number;
  unmatchedHeaders: string[];
  batch: string;
}

/**
 * Bulk-import accounts from an .xlsx or .csv sheet. Columns are matched by
 * header name, so the two existing layouts (and future rounds) just work.
 * Rows whose FB email already exists are skipped, so re-uploading is safe.
 */
export function MetaAccountImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [batch, setBatch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);

  // Matches the route's cap — and Vercel rejects bodies over ~4.5 MB before
  // the route even runs, so pre-check here for a friendly message.
  const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

  async function handleUpload() {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("File is too large (max 4 MB). Split the sheet and import in parts.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (batch.trim()) fd.append("batch", batch.trim());
      const res = await fetch("/api/admin/meta-accounts/import", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setResult(json.data as ImportSummary);
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative mt-16 w-full max-w-md rounded-2xl bg-card shadow-xl border border-border/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-border/50">
          <div>
            <h2 className="text-lg font-bold text-foreground">Import accounts</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Upload an .xlsx or .csv sheet. Columns are matched by header name.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {result ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
                <p className="text-sm font-bold">
                  Imported {result.imported} account{result.imported === 1 ? "" : "s"}
                </p>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>Batch: <span className="font-medium text-foreground">{result.batch}</span></li>
                <li>Rows read: {result.totalRows}</li>
                {result.skippedDuplicate > 0 && <li>Skipped (already exist): {result.skippedDuplicate}</li>}
                {result.skippedEmpty > 0 && <li>Skipped (no email): {result.skippedEmpty}</li>}
                {result.unmatchedHeaders.length > 0 && (
                  <li>Unmatched columns: {result.unmatchedHeaders.join(", ")}</li>
                )}
              </ul>
              <button
                onClick={onClose}
                className="w-full rounded-lg px-4 py-2 text-sm font-bold text-white ac-gradient hover:opacity-90"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-8 text-center cursor-pointer hover:border-primary/40 hover:bg-muted/30 transition-colors">
                <input
                  type="file"
                  accept=".xlsx,.csv,.tsv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setFile(f);
                    if (f && !batch.trim()) setBatch(f.name.replace(/\.[^.]+$/, ""));
                  }}
                />
                {file ? (
                  <>
                    <FileSpreadsheet className="h-8 w-8 text-primary" />
                    <span className="text-sm font-semibold text-foreground">{file.name}</span>
                    <span className="text-xs text-muted-foreground">Click to choose a different file</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm font-semibold text-foreground">Choose a file</span>
                    <span className="text-xs text-muted-foreground">.xlsx or .csv, up to 4 MB</span>
                  </>
                )}
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Batch label</span>
                <input
                  value={batch}
                  onChange={(e) => setBatch(e.target.value)}
                  placeholder="e.g. 3rd Round – Aug 2026"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>

              <button
                onClick={handleUpload}
                disabled={busy || !file}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white ac-gradient hover:opacity-90 active:scale-95 transition-all disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Import
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
