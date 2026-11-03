"use client";

import { useState } from "react";
import { Upload, Loader2, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { badgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 pr-14">
          <DialogTitle>Import accounts</DialogTitle>
          <DialogDescription>
            Upload an .xlsx or .csv sheet. Columns are matched by header name.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 pb-6">
          {error && (
            <div className={cn("rounded-2xl border px-4 py-3 text-sm", badgeTone.danger)}>
              {error}
            </div>
          )}

          {result ? (
            <div className="space-y-4">
              <div className={cn("flex items-center gap-2 rounded-2xl border px-4 py-3", badgeTone.success)}>
                <CheckCircle2 className="size-4 shrink-0" />
                <p className="text-sm font-medium">
                  Imported {result.imported} account{result.imported === 1 ? "" : "s"}
                </p>
              </div>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>
                  Batch: <span className="font-medium text-foreground">{result.batch}</span>
                </li>
                <li>Rows read: {result.totalRows}</li>
                {result.skippedDuplicate > 0 && <li>Skipped (already exist): {result.skippedDuplicate}</li>}
                {result.skippedEmpty > 0 && <li>Skipped (no email): {result.skippedEmpty}</li>}
                {result.unmatchedHeaders.length > 0 && (
                  <li>Unmatched columns: {result.unmatchedHeaders.join(", ")}</li>
                )}
              </ul>
              <Button onClick={onClose} className="w-full">
                Done
              </Button>
            </div>
          ) : (
            <>
              <label className="relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed px-4 py-8 text-center transition-colors hover:bg-muted/50 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/30">
                <input
                  type="file"
                  accept=".xlsx,.csv,.tsv,text/csv"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setFile(f);
                    if (f && !batch.trim()) setBatch(f.name.replace(/\.[^.]+$/, ""));
                  }}
                />
                {file ? (
                  <>
                    <FileSpreadsheet className="size-8 text-foreground" />
                    <span className="break-all text-sm font-medium">{file.name}</span>
                    <span className="text-xs text-muted-foreground">Click to choose a different file</span>
                  </>
                ) : (
                  <>
                    <Upload className="size-8 text-muted-foreground" />
                    <span className="text-sm font-medium">Choose a file</span>
                    <span className="text-xs text-muted-foreground">.xlsx or .csv, up to 4 MB</span>
                  </>
                )}
              </label>

              <div className="grid gap-2">
                <Label htmlFor="meta-import-batch">Batch label</Label>
                <Input
                  id="meta-import-batch"
                  value={batch}
                  onChange={(e) => setBatch(e.target.value)}
                  placeholder="e.g. 3rd Round – Aug 2026"
                />
              </div>

              <Button onClick={handleUpload} disabled={busy || !file} className="w-full">
                {busy ? <Loader2 className="animate-spin" /> : <Upload />}
                Import
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
