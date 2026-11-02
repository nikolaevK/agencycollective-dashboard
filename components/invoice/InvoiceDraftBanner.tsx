"use client";

import { Bot } from "lucide-react";
import type { InvoiceDraftView } from "@/components/invoice/invoiceDraftClient";

/** Who prepared the draft and why — shown at the top of a reviewed draft. */
export function InvoiceDraftBanner({ draft }: { draft: InvoiceDraftView }) {
  const when = new Date(draft.createdAt);
  return (
    <div className="space-y-1 rounded-2xl bg-muted/50 p-4">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium text-foreground">
        <Bot className="size-4 shrink-0 text-muted-foreground" />
        Prepared by {draft.createdByName ?? (draft.source === "api" ? "an agent" : "a teammate")}
        {!Number.isNaN(when.getTime()) && (
          <span className="text-xs font-normal text-muted-foreground">· {when.toLocaleString()}</span>
        )}
      </p>
      {draft.note && <p className="whitespace-pre-wrap text-xs text-foreground">{draft.note}</p>}
      {draft.status === "pending" ? (
        <p className="text-xs text-muted-foreground">
          Review and adjust anything below — nothing has been sent. Sending emails the client and files the invoice.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          This draft was already {draft.status}
          {draft.reviewedByName ? ` by ${draft.reviewedByName}` : ""}.
        </p>
      )}
    </div>
  );
}
