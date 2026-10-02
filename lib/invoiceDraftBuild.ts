import { randomUUID } from "crypto";
import type { InvoiceData, PaymentType } from "@/types/invoice";
import { getClientDetail } from "./clientDirectory";
import { generateClientInvoiceData, generateClientInvoiceNumber } from "./clientInvoice";
import { generateAdAccountInvoiceData } from "./adAccountInvoice";
import { buildAdAccountLineItems } from "./adAccountLineItem";
import { normalizeFeeBps, type AdAccount } from "./adAccounts";
import { findUser } from "./users";
import { applyInvoiceSpec, type InvoiceSpec } from "./invoice/invoiceSpec";
import type { InvoiceDraftOptions } from "./invoiceDrafts";

/**
 * Server-side construction of invoice-draft data for the v1 API — the SAME
 * prefill the dashboard drawers start from (agency sender, payment block,
 * logo, theme, invoice number), with the caller's InvoiceSpec applied on top.
 */

/** Stamp the address the invoice goes to into its "Bill to" block. */
function withRecipient(data: InvoiceData, email: string | null): InvoiceData {
  return email ? { ...data, receiver: { ...data.receiver, email } } : data;
}

export async function buildClientRebillDraftData(params: {
  userId: string;
  paymentType: PaymentType;
  spec: InvoiceSpec | null;
  recipientEmail: string | null;
}): Promise<{ invoiceData: InvoiceData; recipientEmail: string | null } | null> {
  const detail = await getClientDetail(params.userId);
  if (!detail) return null;
  const base = await generateClientInvoiceData({
    clientName: detail.row.displayName,
    clientEmail: detail.row.email,
    amountCents: detail.row.payoutMrr,
    serviceName: detail.history[0]?.service ?? null,
    invoiceNumber: generateClientInvoiceNumber(),
    paymentType: params.paymentType,
  });
  const recipientEmail = params.recipientEmail ?? (detail.row.email || null);
  const data = params.spec ? applyInvoiceSpec(base, params.spec) : base;
  return { invoiceData: withRecipient(data, recipientEmail), recipientEmail };
}

/**
 * Ad-account invoices mirror the drawer: the retainer + ad-spend-fee lines are
 * generated from the components, and `spec.items` are EXTRA lines after them
 * (they never replace the generated ones).
 */
export function applyAdAccountSpec(
  data: InvoiceData,
  spec: InvoiceSpec,
  lineIds: InvoiceDraftOptions["lineIds"]
): InvoiceData {
  const isGenerated = (id: string) => !!lineIds && (id === lineIds.retainer || id === lineIds.adSpend);
  const generated = data.details.items.filter((it) => isGenerated(it.id));
  const extras = spec.items
    ? applyInvoiceSpec(data, { items: spec.items }).details.items
    : data.details.items.filter((it) => !isGenerated(it.id));
  const rest: InvoiceSpec = { ...spec };
  delete rest.items;
  return applyInvoiceSpec(
    { ...data, details: { ...data.details, items: [...generated, ...extras] } },
    rest
  );
}

export async function buildAdAccountDraftData(params: {
  account: AdAccount;
  paymentType: PaymentType;
  retainerCents?: number;
  spendCents?: number;
  feeBps?: number;
  cycleAnchor?: string | null;
  spec: InvoiceSpec | null;
  recipientEmail: string | null;
}): Promise<{ invoiceData: InvoiceData; recipientEmail: string | null; options: InvoiceDraftOptions }> {
  const { account } = params;
  let clientName = "";
  let clientEmail: string | null = null;
  if (account.userId) {
    const user = await findUser(account.userId);
    if (user) {
      clientName = user.displayName;
      clientEmail = user.email;
    }
  }
  const retainerCents = params.retainerCents ?? account.monthlyRetainerCents;
  const spendCents = params.spendCents ?? 0;
  const feeBps = params.feeBps && params.feeBps > 0 ? normalizeFeeBps(params.feeBps) : account.adSpendFeeBps;

  const base = await generateAdAccountInvoiceData({
    clientName,
    clientEmail,
    invoiceNumber: generateClientInvoiceNumber(),
    paymentType: params.paymentType,
    accountName: account.accountName,
    vendor: account.vendor,
    monthlyRetainerCents: retainerCents,
    spendCents,
    feeBps,
  });
  // Rebuild the generated lines with ids we keep, so the drawer can tell
  // them apart from extra lines when the draft is reviewed.
  const lineIds = { retainer: randomUUID(), adSpend: randomUUID() };
  const generated = buildAdAccountLineItems({
    retainerId: lineIds.retainer,
    adSpendId: lineIds.adSpend,
    accountName: account.accountName,
    vendor: account.vendor,
    monthlyRetainerCents: retainerCents,
    spendCents,
    feeBps,
    serviceProvider: base.sender.name || undefined,
  });
  let data: InvoiceData = { ...base, details: { ...base.details, items: generated } };
  data = applyAdAccountSpec(data, params.spec ?? {}, lineIds);
  if (data.details.items.length === 0) {
    throw new DraftBuildError("The invoice has no lines — pass retainerCents/spendCents or invoice.items");
  }

  const recipientEmail = params.recipientEmail ?? (clientEmail || null);
  return {
    invoiceData: withRecipient(data, recipientEmail),
    recipientEmail,
    options: { retainerCents, spendCents, feeBps, cycleAnchor: params.cycleAnchor ?? null, lineIds },
  };
}

export class DraftBuildError extends Error {}
