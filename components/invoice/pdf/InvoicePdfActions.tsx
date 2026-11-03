"use client";

import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import type { EmailAccount } from "@/lib/invoice/emailService";
import {
  invoiceDataSchema,
  saveInvoice,
  getSavedInvoices,
  exportAsJson,
  exportAsCsv,
  exportAsXml,
  downloadBlob,
} from "@/lib/invoice/validation";
import { AttachmentPicker, useEmailAttachments } from "../AttachmentPicker";
import { INVOICE_NOTICE, InvoiceField, NativeSelect } from "../InvoiceField";
import { badgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { isValidEmail } from "@/lib/invoice/email";
// react-pdf loads on first use — hovering/focusing the PDF buttons starts the
// download, so a click rarely waits on it.
import { loadPdfKit } from "./pdfKit";

interface Props {
  data: InvoiceData;
  onNewInvoice: () => void;
  onOpenSaved: () => void;
  /** In-page preview (the page's full-screen dialog). Falls back to a new tab. */
  onPreview?: () => void;
  /** Hover/focus on Preview / Load: start fetching what the click will open. */
  onWarmPreview?: () => void;
  onWarmSaved?: () => void;
}

const SECTION_LABELS: Record<string, string> = {
  sender: "From",
  receiver: "Bill to",
  details: "Invoice",
};

/** "details.items.0.name: Item name is required" → "Line 1: Item name is required". */
function friendlyIssue(path: (string | number)[], message: string): string {
  if (path[0] === "details" && path[1] === "items" && typeof path[2] === "number") {
    return `Line ${path[2] + 1}: ${message}`;
  }
  const section = SECTION_LABELS[String(path[0])];
  return section ? `${section}: ${message}` : message;
}

export function InvoicePdfActions({ data, onNewInvoice, onOpenSaved, onPreview, onWarmPreview, onWarmSaved }: Props) {
  const id = useId();
  const [generating, setGenerating] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fromAccount, setFromAccount] = useState("");
  // Cleared on send AND on dialog close — the component never unmounts, so
  // without the close-time clear a file picked for one invoice would silently
  // ride along on the next one's send.
  const attach = useEmailAttachments();

  // Configured "send from" accounts (id/label/email only — no credentials).
  const { data: emailAccounts = [] } = useQuery<EmailAccount[]>({
    queryKey: ["invoice-email-accounts"],
    queryFn: async () => {
      const res = await fetch("/api/invoice/email-accounts");
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  // Falls back to the first configured account, then "primary" as a last resort.
  const selectedAccount = fromAccount || emailAccounts[0]?.id || "primary";
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<"success" | "error" | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [saveMsg, setSaveMsg] = useState("");

  const validate = (): boolean => {
    const result = invoiceDataSchema.safeParse(data);
    if (!result.success) {
      const errors = Array.from(
        new Set(result.error.issues.map((issue) => friendlyIssue(issue.path, issue.message)))
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
      const [{ pdf }, { InvoicePdfDocument }] = await loadPdfKit();
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
    if (onPreview) {
      if (validate()) onPreview();
      return;
    }
    const blob = await generateBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  // Print from a hidden iframe: no popup to get blocked (window.open after an
  // await often is), and the blob URL is released afterwards.
  const handlePrint = async () => {
    const blob = await generateBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.src = url;
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        window.open(url, "_blank");
      }
    };
    document.body.appendChild(frame);
    setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
  };

  const handleSave = () => {
    const entry = saveInvoice(data);
    // saveInvoice swallows a full-storage error — confirm it actually landed.
    const stored = getSavedInvoices().some((i) => i.id === entry.id);
    setSaveMsg(stored ? "Invoice saved!" : "");
    if (!stored) {
      setValidationErrors(["Couldn't save — this browser's invoice storage is full. Delete some saved invoices (Load) and try again."]);
    }
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
    // Locked from the first click — the PDF render below takes a moment, and
    // a second click used to start a second send.
    if (sending || sendResult === "success") return;
    if (!isValidEmail(email)) {
      setSendResult("error");
      setSendError("Enter a valid recipient email.");
      return;
    }
    setSending(true);
    setSendResult(null);
    setSendError(null);
    const blob = await generateBlob();
    if (!blob) {
      setSending(false);
      return;
    }
    try {
      const formData = new FormData();
      formData.append("email", email.trim());
      formData.append(
        "pdf",
        new File([blob], `invoice-${data.details.invoiceNumber || "draft"}.pdf`, {
          type: "application/pdf",
        })
      );
      formData.append("invoiceNumber", data.details.invoiceNumber || "draft");
      formData.append("accountId", selectedAccount);
      // Additional email attachments alongside the invoice PDF. Server
      // re-validates count/size/extension; this is just the wire format.
      for (const file of attach.attachments) formData.append("attachments", file);

      const res = await fetch("/api/invoice/send", { method: "POST", body: formData });
      setSendResult(res.ok ? "success" : "error");
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setSendError(typeof j.error === "string" ? j.error : null);
      }
      if (res.ok) {
        setTimeout(() => {
          setEmailOpen(false);
          setEmail("");
          attach.clear();
          setSendResult(null);
        }, 2000);
      }
    } catch {
      setSendResult("error");
    } finally {
      setSending(false);
    }
  };

  const sendDisabled = sending || generating || sendResult === "success" || !email.trim();

  return (
    <Card>
      <CardHeader className="pb-4 md:pb-4">
        <CardTitle>Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Validation errors */}
        {validationErrors.length > 0 && (
          <div role="alert" className={cn(INVOICE_NOTICE, "space-y-1 font-normal", badgeTone.danger)}>
            {validationErrors.map((err, i) => (
              <p key={i}>{err}</p>
            ))}
          </div>
        )}

        {saveMsg && (
          <p role="status" className={cn(INVOICE_NOTICE, badgeTone.success)}>
            {saveMsg}
          </p>
        )}

        {/* File operations */}
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onNewInvoice}>
            <FilePlus />
            New
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenSaved}
            onPointerEnter={onWarmSaved}
            onFocus={onWarmSaved}
          >
            <FolderOpen />
            Load
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleSave}>
            <Save />
            Save
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setExportOpen(!exportOpen)}
            aria-expanded={exportOpen}
          >
            <FileJson />
            Export
          </Button>
        </div>

        {/* Export panel */}
        {exportOpen && (
          <div className="space-y-2 rounded-2xl bg-muted/50 p-3">
            <p className="text-xs font-medium text-muted-foreground">Export format</p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { format: "json", label: "JSON", icon: FileJson },
                  { format: "csv", label: "CSV", icon: FileSpreadsheet },
                  { format: "xml", label: "XML", icon: FileCode },
                ] as const
              ).map((o) => (
                <Button
                  key={o.format}
                  type="button"
                  variant="outline"
                  onClick={() => handleExport(o.format)}
                  className="h-auto flex-col gap-1 rounded-2xl py-2 text-xs"
                >
                  <o.icon className="text-muted-foreground" />
                  {o.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* PDF actions */}
        <div
          className="space-y-2 border-t pt-4"
          // Warm the PDF renderer (and the preview dialog) before the click lands.
          onPointerEnter={() => {
            void loadPdfKit();
            onWarmPreview?.();
          }}
          onFocus={() => {
            void loadPdfKit();
            onWarmPreview?.();
          }}
        >
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Generate PDF</p>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" onClick={handleDownload} disabled={generating} className="col-span-2">
              {generating ? <Loader2 className="animate-spin" /> : <Download />}
              {generating ? "Generating..." : "Download PDF"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handlePreview} disabled={generating}>
              <Eye />
              Preview
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handlePrint} disabled={generating}>
              <Printer />
              Print
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEmailOpen(true);
                setSendResult(null);
              }}
              disabled={generating}
              className="col-span-2"
            >
              <Mail />
              Send via Email
            </Button>
          </div>
        </div>

        {/* Email panel */}
        {emailOpen && (
          <div className="space-y-3 rounded-2xl bg-muted/50 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">Send Invoice</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => { setEmailOpen(false); setSendResult(null); setSendError(null); attach.clear(); }}
                disabled={sending}
                aria-label="Close send panel"
                className="text-muted-foreground"
              >
                <X />
              </Button>
            </div>
            {emailAccounts.length > 0 && (
              <InvoiceField label="Send from" htmlFor={`${id}-from`}>
                <NativeSelect
                  id={`${id}-from`}
                  value={selectedAccount}
                  onChange={(e) => setFromAccount(e.target.value)}
                >
                  {emailAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label && a.label !== a.email ? `${a.label} (${a.email})` : a.email}
                    </option>
                  ))}
                </NativeSelect>
              </InvoiceField>
            )}
            <Input
              type="email"
              aria-label="Recipient email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (sendError) setSendError(null);
              }}
              placeholder="recipient@example.com"
            />

            {/* Attachments (optional) — included with the email alongside the
                invoice PDF. */}
            <AttachmentPicker state={attach} />

            {sendResult === "success" && (
              <p role="status" className={cn(INVOICE_NOTICE, badgeTone.success)}>
                Invoice sent!
              </p>
            )}
            {sendResult === "error" && (
              <p role="alert" className={cn(INVOICE_NOTICE, badgeTone.danger)}>
                {sendError ?? "Failed to send. Check server SMTP configuration."}
              </p>
            )}
            <Button type="button" onClick={handleSendEmail} disabled={sendDisabled} className="w-full">
              {sending ? <Loader2 className="animate-spin" /> : <Mail />}
              {sending ? "Sending..." : "Send"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
