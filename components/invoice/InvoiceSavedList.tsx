"use client";

import { useState, useEffect, useRef } from "react";
import { Trash2, Upload } from "lucide-react";
import type { InvoiceData, SavedInvoice } from "@/types/invoice";
import { getSavedInvoices, deleteSavedInvoice, formatCurrencyValue } from "@/lib/invoice/validation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { parseImportedInvoice } from "./importInvoice";

interface Props {
  open: boolean;
  onClose: () => void;
  onLoad: (data: InvoiceData) => void;
  onImport: (data: InvoiceData) => void;
}

export function InvoiceSavedList({ open, onClose, onLoad, onImport }: Props) {
  const [invoices, setInvoices] = useState<SavedInvoice[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [importError, setImportError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setInvoices(getSavedInvoices());
      setImportError("");
    }
  }, [open]);

  const handleDelete = (id: string) => {
    if (deleting === id) {
      deleteSavedInvoice(id);
      setInvoices((prev) => prev.filter((inv) => inv.id !== id));
      setDeleting(null);
    } else {
      setDeleting(id);
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let raw: unknown;
      try {
        raw = JSON.parse(reader.result as string);
      } catch {
        setImportError("Failed to parse JSON file");
        return;
      }
      // A file of the wrong shape used to reach the editor and crash the page.
      const parsed = parseImportedInvoice(raw);
      if (!parsed.ok) {
        setImportError(parsed.error);
        return;
      }
      onImport(parsed.data);
      onClose();
    };
    reader.readAsText(file);
    // Let the same file be picked again after a failed import.
    e.target.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[80dvh] flex-col gap-4 sm:max-w-lg">
        <DialogHeader className="pr-8">
          <DialogTitle>Saved Invoices</DialogTitle>
          <DialogDescription>Saved in this browser. Load one, or import an exported JSON file.</DialogDescription>
        </DialogHeader>

        {/* Import */}
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            className="w-full border-dashed"
            onClick={() => fileRef.current?.click()}
          >
            <Upload />
            Import from JSON
          </Button>
          <input ref={fileRef} type="file" accept=".json" onChange={handleImportFile} className="hidden" />
          {importError && (
            <p role="alert" className="text-xs text-destructive">
              {importError}
            </p>
          )}
        </div>

        {/* List */}
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {invoices.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No saved invoices yet
            </p>
          ) : (
            <ul className="space-y-2">
              {invoices.map((inv) => (
                <li key={inv.id} className="flex items-start justify-between gap-2 rounded-2xl border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">#{inv.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {inv.senderName} → {inv.receiverName}
                    </p>
                    <div className="mt-1 flex items-center gap-3">
                      <span className="text-sm font-semibold tabular-nums text-foreground">
                        {formatCurrencyValue(inv.totalAmount, inv.currency)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(inv.savedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        onLoad(inv.data);
                        onClose();
                      }}
                    >
                      Load
                    </Button>
                    <Button
                      type="button"
                      variant={deleting === inv.id ? "destructive" : "ghost"}
                      size="icon-sm"
                      onClick={() => handleDelete(inv.id)}
                      title={deleting === inv.id ? "Click again to confirm" : "Delete"}
                      aria-label={deleting === inv.id ? `Confirm delete #${inv.label}` : `Delete #${inv.label}`}
                      className={cn(deleting !== inv.id && "text-muted-foreground hover:text-destructive")}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
