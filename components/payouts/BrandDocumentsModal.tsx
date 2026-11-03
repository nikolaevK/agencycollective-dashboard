"use client";

import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Upload,
  Trash2,
  Download,
  Loader2,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DocType, PayoutDocument } from "@/lib/payoutDocuments";
import { MAX_DOCUMENT_SIZE_BYTES } from "@/lib/payoutDocumentRules";

interface BrandDocumentsModalProps {
  open: boolean;
  onClose: () => void;
  brandName: string;
  defaultMonth: number;
  defaultYear: number;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(raw: string): string {
  // SQLite's datetime('now') stores UTC as "YYYY-MM-DD HH:MM:SS" with no zone
  // marker. Parsed as-is, JS treats it as LOCAL time, which rolls the day
  // forward for viewers behind UTC (e.g. a doc saved at 01:00 UTC shows the
  // next day). Normalize to an explicit UTC instant so toLocaleDateString
  // converts it back to the viewer's real local date.
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)
    ? raw
    : raw.replace(" ", "T") + "Z";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ── Document row ─────────────────────────────────────────────── */
function DocumentRow({
  doc,
  onDelete,
  deleting,
}: {
  doc: PayoutDocument;
  onDelete: (id: string) => void;
  deleting: string | null;
}) {
  const isDeleting = deleting === doc.id;

  return (
    <div className="flex items-center gap-3 px-6 py-3 border-b last:border-0 group">
      <FileText className="size-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {doc.fileName}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatFileSize(doc.fileSize)} &middot; {formatDate(doc.createdAt)}
          {doc.payoutMonth && doc.payoutYear && (
            <> &middot; {MONTH_NAMES[doc.payoutMonth - 1]} {doc.payoutYear}</>
          )}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          asChild
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
        >
          <a
            href={`/api/admin/payouts/documents/${doc.id}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Download"
          >
            <Download />
          </a>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onDelete(doc.id)}
          disabled={isDeleting}
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title="Delete"
        >
          {isDeleting ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Trash2 />
          )}
        </Button>
      </div>
    </div>
  );
}

/* ── Upload area ──────────────────────────────────────────────── */
function UploadArea({
  docType,
  brandName,
  defaultMonth,
  defaultYear,
  onUploaded,
}: {
  docType: DocType;
  brandName: string;
  defaultMonth: number;
  defaultYear: number;
  onUploaded: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [tagMonth, setTagMonth] = useState(docType === "invoice" ? defaultMonth : 0);
  const [tagYear, setTagYear] = useState(docType === "invoice" ? defaultYear : 0);

  const handleUpload = async (file: File) => {
    setError("");
    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
      setError("File too large (max 10 MB)");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are allowed");
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("brandName", brandName);
      fd.append("docType", docType);
      if (docType === "invoice" && tagMonth && tagYear) {
        fd.append("payoutMonth", String(tagMonth));
        fd.append("payoutYear", String(tagYear));
      }

      const res = await fetch("/api/admin/payouts/documents", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Upload failed");
        return;
      }

      onUploaded();
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="px-6 py-4 space-y-3">
      {docType === "invoice" && (
        <div className="flex items-center gap-2">
          <Label className="text-muted-foreground">Period:</Label>
          <Select
            value={String(tagMonth)}
            onValueChange={(v) => setTagMonth(Number(v))}
          >
            <SelectTrigger className="h-8 w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">—</SelectItem>
              {MONTH_NAMES.map((m, i) => (
                <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            inputMode="numeric"
            value={tagYear || ""}
            onChange={(e) => setTagYear(Number(e.target.value))}
            placeholder="Year"
            min={2000}
            max={2100}
            className="h-8 w-24"
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
          }}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Upload />
          )}
          Upload PDF
        </Button>
        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
      </div>
    </div>
  );
}

/* ── Main modal ───────────────────────────────────────────────── */
export function BrandDocumentsModal({
  open,
  onClose,
  brandName,
  defaultMonth,
  defaultYear,
}: BrandDocumentsModalProps) {
  const [tab, setTab] = useState<DocType>("project_scope");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const queryKey = ["payout-documents", brandName];

  const { data: docs = [], isLoading } = useQuery<PayoutDocument[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/payouts/documents?brandName=${encodeURIComponent(brandName)}`
      );
      if (!res.ok) throw new Error("Failed to fetch documents");
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: open,
    staleTime: 30_000,
  });

  const filtered = docs.filter((d) => d.docType === tab);

  const handleDelete = async (id: string) => {
    if (deleteConfirm !== id) {
      setDeleteConfirm(id);
      return;
    }
    setDeleting(id);
    setDeleteConfirm(null);
    try {
      const res = await fetch(
        `/api/admin/payouts/documents?id=${id}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey });
      }
    } finally {
      setDeleting(null);
    }
  };

  const handleUploaded = () => {
    queryClient.invalidateQueries({ queryKey });
  };

  if (!open) return null;

  const tabs: { value: DocType; label: string }[] = [
    { value: "project_scope", label: "Project Scope" },
    { value: "invoice", label: "Invoices" },
  ];

  const scopeCount = docs.filter((d) => d.docType === "project_scope").length;
  const invoiceCount = docs.filter((d) => d.docType === "invoice").length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        // The old modal had no Escape handler — it closes only via the X
        // button or a backdrop click.
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        {/* Header */}
        <DialogHeader className="shrink-0 px-6 pt-6 pb-2 pr-14 min-w-0">
          <DialogTitle className="truncate">
            Documents
          </DialogTitle>
          <DialogDescription className="truncate">
            {brandName}
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="shrink-0 px-6 pt-2 pb-2">
          <Tabs value={tab}>
            <TabsList>
              {tabs.map((t) => {
                const count = t.value === "project_scope" ? scopeCount : invoiceCount;
                return (
                  <TabsTrigger
                    key={t.value}
                    value={t.value}
                    onClick={() => { setTab(t.value); setDeleteConfirm(null); }}
                  >
                    {t.label} ({count})
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>

        {/* Content */}
        <div className="min-h-0 max-h-[55dvh] overflow-y-auto overscroll-contain">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-6 py-8 text-sm text-muted-foreground text-center">
              No {tab === "project_scope" ? "project scope" : "invoice"} documents yet
            </p>
          ) : (
            filtered.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                onDelete={handleDelete}
                deleting={deleting}
              />
            ))
          )}
        </div>

        {/* Delete confirmation banner */}
        {deleteConfirm && (
          <div className="shrink-0 px-6 py-2 bg-destructive/10 border-t flex items-center justify-between gap-2">
            <p className="text-xs text-destructive">
              Click delete again to confirm removal
            </p>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setDeleteConfirm(null)}
            >
              Cancel
            </Button>
          </div>
        )}

        {/* Upload */}
        <div className="shrink-0 border-t">
          <UploadArea
            key={tab}
            docType={tab}
            brandName={brandName}
            defaultMonth={defaultMonth}
            defaultYear={defaultYear}
            onUploaded={handleUploaded}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
