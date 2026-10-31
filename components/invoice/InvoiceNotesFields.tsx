"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="-ml-2 px-2"
      >
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", !open && "-rotate-90")} />
        Notes &amp; payment terms
        {!open && hasContent && <span className="text-xs font-normal text-muted-foreground">(set)</span>}
      </Button>
      {open && (
        <div className="mt-2 grid grid-cols-1 gap-4 pl-6 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`${idPrefix}-terms`}>Payment terms</Label>
            <Textarea
              id={`${idPrefix}-terms`}
              rows={3}
              maxLength={2000}
              value={paymentTerms}
              onChange={(e) => onChange({ paymentTerms: e.target.value })}
              placeholder="e.g. Net 15. Late payments incur…"
              className="resize-y"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${idPrefix}-notes`}>Additional notes</Label>
            <Textarea
              id={`${idPrefix}-notes`}
              rows={3}
              maxLength={2000}
              value={additionalNotes}
              onChange={(e) => onChange({ additionalNotes: e.target.value })}
              placeholder="Printed at the bottom of the invoice"
              className="resize-y"
            />
          </div>
        </div>
      )}
    </div>
  );
}
