"use client";

import { useState } from "react";
import { pdf } from "@react-pdf/renderer";
import {
  Download,
  Eye,
  Printer,
  Mail,
  Save,
  FolderOpen,
  FileJson,
  FileSpreadsheet,
  FileCode,
  Loader2,
  X,
  FilePlus,
} from "lucide-react";
import type { InvoiceData } from "@/types/invoice";
import {
  invoiceDataSchema,
  saveInvoice,
  exportAsJson,
  exportAsCsv,
  exportAsXml,
  downloadBlob,
} from "@/lib/invoice/validation";
import { InvoicePdfDocument } from "./InvoicePdfTemplate";
import { cn } from "@/lib/utils";

interface Props {
  data: InvoiceData;
  onNewInvoice: () => void;
  onOpenSaved: () => void;
}

export function InvoicePdfActions({ data, onNewInvoice, onOpenSaved }: Props) {
  const [generating, setGenerating] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<"success" | "error" | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [saveMsg, setSaveMsg] = useState("");

  const validate = (): boolean => {
    const result = invoiceDataSchema.safeParse(data);
    if (!result.success) {
      const errors = result.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`
      );
      setValidationErrors(errors);
      return false;
    }
    setValidationErrors([]);
    return true;
  };

  const generateBlob = async (): Promise<Blob | null> => {
    if (!validate()) return null;
    setGenerating(true);
    try {
      const blob = await pdf(<InvoicePdfDocument data={data} />).toBlob();
      return blob;
    } catch (err) {
      console.error("PDF generation failed:", err);
      setValidationErrors(["Failed to generate PDF. Please try again."]);
      return null;
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    const blob = await generateBlob();
    if (!blob) return;
    downloadBlob(blob, `invoice-${data.details.invoiceNumber || "draft"}.pdf`);
  };

  const handlePreview = async () => {
    const blob = await generateBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const handlePrint = async () => {
    const blob = await generateBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      win.addEventListener("load", () => win.print());
    }
  };

  const handleSave = () => {
    saveInvoice(data);
    setSaveMsg("Invoice saved!");
    setTimeout(() => setSaveMsg(""), 2000);
  };

  const handleExport = (format: "json" | "csv" | "xml") => {
    const filename = `invoice-${data.details.invoiceNumber || "draft"}`;
    if (format === "json") downloadBlob(exportAsJson(data), `${filename}.json`);
    if (format === "csv") downloadBlob(exportAsCsv(data), `${filename}.csv`);
    if (format === "xml") downloadBlob(exportAsXml(data), `${filename}.xml`);
    setExportOpen(false);
  };

  const handleSendEmail = async () => {
    if (!email.trim()) return;
    const blob = await generateBlob();
    if (!blob) return;

    setSending(true);
    setSendResult(null);
    try {
      const formData = new FormData();
      formData.append("email", email);
      formData.append(
        "pdf",
        new File([blob], `invoice-${data.details.invoiceNumber || "draft"}.pdf`, {
          type: "application/pdf",
        })
      );
      formData.append("invoiceNumber", data.details.invoiceNumber || "draft");

      const res = await fetch("/api/invoice/send", { method: "POST", body: formData });
      setSendResult(res.ok ? "success" : "error");
      if (res.ok) {
        setTimeout(() => {
          setEmailOpen(false);
          setEmail("");
          setSendResult(null);
        }, 2000);
      }
    } catch {
      setSendResult("error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-5 space-y-4">
      <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
        Actions
      </h3>

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
          {validationErrors.map((err, i) => (
            <p key={i} className="text-xs text-destructive">{err}</p>
          ))}
        </div>
      )}

      {saveMsg && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
          <p className="text-xs text-emerald-600 font-medium">{saveMsg}</p>
        </div>
      )}

      {/* File operations */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onNewInvoice}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors"
        >
          <FilePlus className="h-3.5 w-3.5" />
          New
        </button>
        <button
          onClick={onOpenSaved}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Load
        </button>
        <button
          onClick={handleSave}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors"
        >
          <Save className="h-3.5 w-3.5" />
          Save
        </button>
        <button
          onClick={() => setExportOpen(!exportOpen)}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors"
        >
          <FileJson className="h-3.5 w-3.5" />
          Export
        </button>
      </div>

      {/* Export panel */}
      {exportOpen && (
        <div className="rounded-lg border border-border bg-background p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Export format
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleExport("json")}
              className="flex flex-col items-center gap-1 rounded-md border border-border py-2 text-xs hover:bg-accent transition-colors"
            >
              <FileJson className="h-4 w-4 text-amber-500" />
              JSON
            </button>
            <button
              onClick={() => handleExport("csv")}
              className="flex flex-col items-center gap-1 rounded-md border border-border py-2 text-xs hover:bg-accent transition-colors"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
              CSV
            </button>
            <button
              onClick={() => handleExport("xml")}
              className="flex flex-col items-center gap-1 rounded-md border border-border py-2 text-xs hover:bg-accent transition-colors"
            >
              <FileCode className="h-4 w-4 text-blue-500" />
              XML
            </button>
          </div>
        </div>
      )}

      {/* PDF actions */}
      <div className="border-t border-border/50 pt-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Generate PDF
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleDownload}
            disabled={generating}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-all col-span-2",
              "ac-gradient shadow-lg shadow-primary/20",
              generating && "opacity-60 cursor-not-allowed"
            )}
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {generating ? "Generating..." : "Download PDF"}
          </button>
          <button
            onClick={handlePreview}
            disabled={generating}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-60"
          >
            <Eye className="h-3.5 w-3.5" />
            Preview
          </button>
          <button
            onClick={handlePrint}
            disabled={generating}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-60"
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </button>
          <button
            onClick={() => {
              setEmailOpen(true);
              setSendResult(null);
            }}
            disabled={generating}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-60 col-span-2"
          >
            <Mail className="h-3.5 w-3.5" />
            Send via Email
          </button>
        </div>
      </div>

      {/* Email dialog */}
      {emailOpen && (
        <div className="rounded-lg border border-border bg-background p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Send Invoice</span>
            <button
              onClick={() => { setEmailOpen(false); setSendResult(null); }}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="recipient@example.com"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
          />
          {sendResult === "success" && (
            <p className="text-xs text-emerald-600">Invoice sent!</p>
          )}
          {sendResult === "error" && (
            <p className="text-xs text-destructive">
              Failed to send. Check server SMTP configuration.
            </p>
          )}
          <button
            onClick={handleSendEmail}
            disabled={sending || !email.trim()}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-all ac-gradient",
              (sending || !email.trim()) && "opacity-60 cursor-not-allowed"
            )}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      )}
    </div>
  );
}
