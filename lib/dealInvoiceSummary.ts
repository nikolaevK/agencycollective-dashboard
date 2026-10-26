import { invoiceToSpec, type InvoiceSpec } from "./invoice/invoiceSpec";
import type { InvoiceData } from "@/types/invoice";

/**
 * A deal invoice without its heavy parts (the embedded base64 logo alone is
 * ~470 KB) — what agents read and get back from writes with `view=summary`.
 * Money is CENTS, in the same shape an InvoiceSpec takes, so an agent can
 * echo `invoice` back with changes.
 */
export interface DealInvoiceSummary {
  id: string;
  dealId: string;
  invoiceNumber: string;
  status: string;
  additional: boolean;
  clientEmail: string | null;
  sentAt: string | null;
  paymentType: string;
  totalCents: number;
  invoice: InvoiceSpec;
  updatedAt: string;
}

export function summarizeDealInvoice(
  rec: {
    id: string;
    dealId: string;
    invoiceNumber: string;
    status: string;
    invoiceData: InvoiceData;
    clientEmail?: string | null;
    sentAt?: string | null;
    updatedAt: string;
  },
  additional: boolean
): DealInvoiceSummary {
  const data = rec.invoiceData;
  const ok = !!data?.details;
  return {
    id: rec.id,
    dealId: rec.dealId,
    invoiceNumber: rec.invoiceNumber,
    status: rec.status,
    additional,
    // Additional invoices have no client_email column (they go out with the
    // primary) — the address printed on the invoice is the one that counts.
    clientEmail: rec.clientEmail || (ok ? data.receiver?.email : null) || null,
    sentAt: rec.sentAt ?? null,
    paymentType: ok && data.details.paymentInfo?.paymentType === "international" ? "international" : "local",
    totalCents: ok ? Math.round((data.details.totalAmount ?? 0) * 100) : 0,
    invoice: ok ? invoiceToSpec(data) : {},
    updatedAt: rec.updatedAt,
  };
}

/** `?view=summary` on the v1 invoice routes. */
export function wantsSummary(request: Request): boolean {
  return new URL(request.url).searchParams.get("view") === "summary";
}
