"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const TEXTAREA =
  "flex w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow";

/**
 * Collapsible "Notes & payment terms" for the invoice drawers — the same two
 * footer fields the Invoice page edits (printed under Payment Terms /
 * Additional Notes). Opens by default when either already has content.
 */
export function InvoiceNotesFields({
  paymentTerms,
  additionalNotes,
  onChange,
  idPrefix,
}: {
  paymentTerms: string;
  additionalNotes: string;
  onChange: (patch: { paymentTerms?: string; additionalNotes?: string }) => void;
  idPrefix: string;
}) {
  const hasContent = !!(paymentTerms || additionalNotes);
  const [open, setOpen] = useState(hasContent);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-sm font-medium text-foreground"
      >
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", !open && "-rotate-90")} />
        Notes &amp; payment terms
        {!open && hasContent && <span className="text-xs font-normal text-muted-foreground">(set)</span>}
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-1 gap-3 pl-6 sm:grid-cols-2">
          <div>
            <label htmlFor={`${idPrefix}-terms`} className="mb-1 block text-xs font-medium text-muted-foreground">
              Payment terms
            </label>
            <textarea
              id={`${idPrefix}-terms`}
              rows={3}
              maxLength={2000}
              value={paymentTerms}
              onChange={(e) => onChange({ paymentTerms: e.target.value })}
              placeholder="e.g. Net 15. Late payments incur…"
              className={TEXTAREA}
            />
          </div>
          <div>
            <label htmlFor={`${idPrefix}-notes`} className="mb-1 block text-xs font-medium text-muted-foreground">
              Additional notes
            </label>
            <textarea
              id={`${idPrefix}-notes`}
              rows={3}
              maxLength={2000}
              value={additionalNotes}
              onChange={(e) => onChange({ additionalNotes: e.target.value })}
              placeholder="Printed at the bottom of the invoice"
              className={TEXTAREA}
            />
          </div>
        </div>
      )}
    </div>
  );
}
