"use client";

import { useState, useEffect } from "react";
import { X, Trash2, FileDown, Upload } from "lucide-react";
import type { InvoiceData, SavedInvoice } from "@/types/invoice";
import { getSavedInvoices, deleteSavedInvoice, formatCurrencyValue } from "@/lib/invoice/validation";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  onLoad: (data: InvoiceData) => void;
  onImport: (data: InvoiceData) => void;
}

export function InvoiceSavedList({ open, onClose, onLoad, onImport }: Props) {
  const [invoices, setInvoices] = useState<SavedInvoice[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setInvoices(getSavedInvoices());
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [open, onClose]);

  if (!open) return null;

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
      try {
        const data = JSON.parse(reader.result as string) as InvoiceData;
        if (data.sender && data.receiver && data.details) {
          onImport(data);
          onClose();
        } else {
          alert("Invalid invoice file format");
        }
      } catch {
        alert("Failed to parse JSON file");
      }
    };
    reader.readAsText(file);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-x-4 top-[10%] z-[60] mx-auto max-w-lg max-h-[70vh] flex flex-col rounded-2xl border border-border/50 dark:border-white/[0.06] bg-card shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
          <h3 className="text-lg font-semibold text-foreground">
            Saved Invoices
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Import button */}
        <div className="border-b border-border/50 px-5 py-3">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border py-2.5 text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors">
            <Upload className="h-4 w-4" />
            Import from JSON
            <input
              type="file"
              accept=".json"
              onChange={handleImportFile}
              className="hidden"
            />
          </label>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {invoices.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No saved invoices yet
            </p>
          ) : (
            <div className="space-y-2">
              {invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="rounded-lg border border-border/50 bg-background p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        #{inv.label}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {inv.senderName} → {inv.receiverName}
                      </p>
                      <div className="mt-1 flex items-center gap-3">
                        <span className="text-sm font-semibold text-foreground">
                          {formatCurrencyValue(inv.totalAmount, inv.currency)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(inv.savedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => {
                          onLoad(inv.data);
                          onClose();
                        }}
                        className="rounded-md px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => handleDelete(inv.id)}
                        className={cn(
                          "rounded-md p-1.5 transition-colors",
                          deleting === inv.id
                            ? "bg-destructive/10 text-destructive"
                            : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        )}
                        title={
                          deleting === inv.id
                            ? "Click again to confirm"
                            : "Delete"
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
