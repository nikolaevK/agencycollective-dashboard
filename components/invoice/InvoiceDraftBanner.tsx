"use client";

import { Bot } from "lucide-react";
import type { InvoiceDraftView } from "@/components/invoice/invoiceDraftClient";

/** Who prepared the draft and why — shown at the top of a reviewed draft. */
export function InvoiceDraftBanner({ draft }: { draft: InvoiceDraftView }) {
  const when = new Date(draft.createdAt);
  return (
    <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300">
        <Bot className="h-3.5 w-3.5" />
        Prepared by {draft.createdByName ?? (draft.source === "api" ? "an agent" : "a teammate")}
        {!Number.isNaN(when.getTime()) && (
          <span className="font-normal text-muted-foreground">· {when.toLocaleString()}</span>
        )}
      </p>
      {draft.note && <p className="mt-1 whitespace-pre-wrap text-xs text-foreground">{draft.note}</p>}
      {draft.status === "pending" ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Review and adjust anything below — nothing has been sent. Sending emails the client and files the invoice.
        </p>
      ) : (
        <p className="mt-1 text-[11px] text-muted-foreground">
          This draft was already {draft.status}
          {draft.reviewedByName ? ` by ${draft.reviewedByName}` : ""}.
        </p>
      )}
    </div>
  );
}
