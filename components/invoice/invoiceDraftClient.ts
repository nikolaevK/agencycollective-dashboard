"use client";

import type { InvoiceDraft, InvoiceDraftKind, InvoiceDraftOptions } from "@/lib/invoiceDrafts";
import type { InvoiceData, PaymentType } from "@/types/invoice";

/** A draft as the dashboard routes return it (target names resolved). */
export type InvoiceDraftView = InvoiceDraft & { clientName: string | null; accountName: string | null };

export async function fetchInvoiceDraft(id: string): Promise<InvoiceDraftView> {
  const res = await fetch(`/api/admin/clients/invoice-drafts/${id}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json.data;
}

/**
 * "Save draft" from a drawer: creates the draft the first time, then updates
 * it. Returns the saved draft (its id is what the drawer sends with).
 */
export async function saveInvoiceDraft(params: {
  draftId: string | null;
  kind: InvoiceDraftKind;
  userId?: string;
  adAccountId?: string;
  invoiceData: InvoiceData;
  recipientEmail: string;
  ccEmails: string[];
  paymentType: PaymentType;
  options: InvoiceDraftOptions;
}): Promise<InvoiceDraft> {
  const body = {
    invoiceData: params.invoiceData,
    recipientEmail: params.recipientEmail.trim() || null,
    ccEmails: params.ccEmails,
    paymentType: params.paymentType,
    options: params.options,
  };
  const res = params.draftId
    ? await fetch(`/api/admin/clients/invoice-drafts/${params.draftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    : await fetch("/api/admin/clients/invoice-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          kind: params.kind,
          userId: params.userId,
          adAccountId: params.adAccountId,
        }),
      });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json.data;
}
