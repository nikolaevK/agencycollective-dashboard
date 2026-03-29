"use client";

import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  X,
  FileText,
  Upload,
  Trash2,
  Download,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DocType, PayoutDocument } from "@/lib/payoutDocuments";
import { MAX_DOCUMENT_SIZE_BYTES } from "@/lib/payoutDocuments";

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

function formatDate(iso: string): string {
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
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-0 group">
      <FileText className="h-5 w-5 text-red-500 dark:text-red-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
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
        <a
          href={`/api/admin/payouts/documents/${doc.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
          title="Download"
        >
          <Download className="h-4 w-4" />
        </a>
        <button
          onClick={() => onDelete(doc.id)}
          disabled={isDeleting}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
          title="Delete"
        >
          {isDeleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </button>
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
    <div className="px-4 py-3 space-y-2">
      {docType === "invoice" && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Period:</label>
          <select
            value={tagMonth}
            onChange={(e) => setTagMonth(Number(e.target.value))}
            className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground"
          >
            <option value={0}>—</option>
            {MONTH_NAMES.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <input
            type="number"
            value={tagYear || ""}
            onChange={(e) => setTagYear(Number(e.target.value))}
            placeholder="Year"
            min={2000}
            max={2100}
            className="h-7 w-20 rounded-md border border-input bg-background px-2 text-xs text-foreground"
          />
        </div>
      )}
      <div className="flex items-center gap-2">
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
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className={cn(
            "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
            "border border-input bg-background text-foreground hover:bg-accent",
            uploading && "opacity-50"
          )}
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          Upload PDF
        </button>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full mx-4 max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-foreground truncate">
              Documents
            </h3>
            <p className="text-sm text-muted-foreground truncate">
              {brandName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 pt-3 pb-1">
          {tabs.map((t) => {
            const count = t.value === "project_scope" ? scopeCount : invoiceCount;
            return (
              <button
                key={t.value}
                onClick={() => { setTab(t.value); setDeleteConfirm(null); }}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  tab === t.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="max-h-[55vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
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
          <div className="px-4 py-2 bg-destructive/10 border-t border-border/50 flex items-center justify-between">
            <p className="text-xs text-destructive">
              Click delete again to confirm removal
            </p>
            <button
              onClick={() => setDeleteConfirm(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Upload */}
        <div className="border-t border-border">
          <UploadArea
            key={tab}
            docType={tab}
            brandName={brandName}
            defaultMonth={defaultMonth}
            defaultYear={defaultYear}
            onUploaded={handleUploaded}
          />
        </div>
      </div>
    </div>
  );
}
