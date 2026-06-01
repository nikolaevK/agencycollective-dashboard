import type { InvoiceItem } from "@/types/invoice";

// Pure, dependency-free (no DB / server imports) so BOTH the server invoice
// builder (lib/adAccountInvoice.ts) and the client drawer construct the
// canonical ad-account line items identically — the drawer recomputes them
// locally on field changes instead of round-tripping the prefill API.
//
// An ad-account invoice is composed of up to TWO canonical lines:
//   1. Monthly retainer  ("Agency Account" / "Monthly Ad Account Fee")
//   2. Ad-spend fee       ("Agency Ad Account {pct}% Ad Spend Fee")
// A line is included only when its amount is > 0, so a retainer-only or
// ad-spend-only month renders a single line, and a normal month renders both.

/**
 * Describes which components an invoice carries. Stored on the invoice record
 * for reporting; reconciliation does not depend on it.
 */
export type AdInvoiceType = "retainer" | "ad_spend" | "combined";

/** Derive the invoice type from which components have a non-zero amount. */
export function adInvoiceType(retainerCents: number, feeCents: number): AdInvoiceType {
  const hasRetainer = retainerCents > 0;
  const hasFee = feeCents > 0;
  if (hasRetainer && hasFee) return "combined";
  if (hasFee) return "ad_spend";
  return "retainer";
}

/** bps → human percent string, e.g. 350 → "3.5". Trims trailing ".0". */
export function feeBpsToPercentLabel(bps: number): string {
  const pct = bps / 100;
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
}

function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

/** Ad-spend fee (cents) for a spend at a given fee in bps. */
export function computeAdSpendFeeCents(spendCents: number, feeBps: number): number {
  return Math.round((Math.max(0, spendCents) * feeBps) / 10000);
}

function retainerLineItem(
  id: string,
  vendor: string | null | undefined,
  retainerCents: number
): InvoiceItem {
  const unitPrice = retainerCents / 100;
  const v = vendor?.trim();
  const description = v
    ? `Vendor: ${v}\nMonthly Ad Account Fee`
    : "Monthly Ad Account Fee";
  return {
    id,
    name: "Agency Account",
    description,
    quantity: 1,
    unitPrice,
    total: unitPrice,
  };
}

function adSpendLineItem(
  id: string,
  accountName: string | null | undefined,
  spendCents: number,
  feeBps: number,
  serviceProvider: string
): InvoiceItem {
  const feeCents = computeAdSpendFeeCents(spendCents, feeBps);
  const pct = feeBpsToPercentLabel(feeBps);
  const lines = [
    accountName?.trim() || "",
    `Spend: ${formatUsd(spendCents)}`,
    `Fee (${pct}%): ${formatUsd(feeCents)}`,
    "",
    `Agency ad accounts are subject to a ${pct}% ad spend fee which is billed monthly.`,
    "",
    "Unlimited accounts available for Meta, Tiktok, Google",
    "",
    `Must be receiving the service from ${serviceProvider}.`,
  ].filter((l, i) => !(i === 0 && l === "")); // drop empty account-name line
  const unitPrice = feeCents / 100;
  return {
    id,
    name: `Agency Ad Account ${pct}% Ad Spend Fee`,
    description: lines.join("\n"),
    quantity: 1,
    unitPrice,
    total: unitPrice,
  };
}

/**
 * Build the canonical ad-account line items (retainer + ad-spend fee). Each
 * line is included only when its amount is > 0. Stable ids are passed in so the
 * drawer can reconcile these against any extra admin-added items without losing
 * them or churning React keys. `serviceProvider` names the entity in the
 * ad-spend boilerplate ("Must be receiving the service from …") — defaults to
 * the invoice's own brand (Agency Collective), the chosen sender branding.
 */
export function buildAdAccountLineItems(params: {
  retainerId: string;
  adSpendId: string;
  accountName?: string | null;
  vendor?: string | null;
  monthlyRetainerCents?: number;
  spendCents?: number;
  feeBps?: number;
  serviceProvider?: string;
}): InvoiceItem[] {
  const provider = params.serviceProvider?.trim() || "Agency Collective";
  const retainerCents = Math.max(0, Math.round(params.monthlyRetainerCents ?? 0));
  const spendCents = Math.max(0, Math.round(params.spendCents ?? 0));
  const feeBps = params.feeBps ?? 350;

  const items: InvoiceItem[] = [];
  if (retainerCents > 0) {
    items.push(retainerLineItem(params.retainerId, params.vendor, retainerCents));
  }
  if (spendCents > 0) {
    items.push(
      adSpendLineItem(params.adSpendId, params.accountName, spendCents, feeBps, provider)
    );
  }
  return items;
}
