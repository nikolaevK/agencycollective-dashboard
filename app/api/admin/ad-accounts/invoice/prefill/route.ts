export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { normalizeFeeBps } from "@/lib/adAccounts";
import { findUser } from "@/lib/users";
import { generateClientInvoiceNumber } from "@/lib/clientInvoice";
import { generateAdAccountInvoiceData } from "@/lib/adAccountInvoice";
import { requireDirectoryActor, findAdAccountInScope } from "@/lib/api/requireAdmin";

/**
 * Prefilled ad-account invoice. With `adAccountId`, infers the recipient
 * (client name + email) and seeds the line items from the account's vendor /
 * retainer / ad-spend fee. Without it, returns a free invoice the admin fills
 * in manually. The invoice carries both a retainer line and an ad-spend-fee
 * line (each included only when its amount > 0). `spendCents` feeds the
 * ad-spend fee math; `paymentType` swaps the payment-instructions block.
 */
export async function GET(request: Request) {
  const actor = await requireDirectoryActor();
  if (!actor)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  const { searchParams } = new URL(request.url);
  const paymentType = searchParams.get("paymentType") === "international" ? "international" : "local";
  const spendCents = Number(searchParams.get("spendCents"));
  const adAccountId = searchParams.get("adAccountId");

  // Optional live overrides — let the drawer rebuild the line item as the admin
  // toggles fee / retainer / account fields (also the only source for a free
  // invoice with no attached account).
  const feeOverride = Number(searchParams.get("feeBps"));
  const retainerOverride = Number(searchParams.get("retainerCents"));
  const accountNameOverride = searchParams.get("accountName");
  const vendorOverride = searchParams.get("vendor");

  let clientName = "";
  let clientEmail: string | null = null;
  let accountName: string | null = null;
  let vendor: string | null = null;
  let monthlyRetainerCents = 0;
  let feeBps = 350;
  let brand: string | null = null;

  if (adAccountId) {
    const account = await findAdAccountInScope(actor.scope, adAccountId);
    if (!account)
      return NextResponse.json({ error: "Ad account not found" }, { status: 404 });
    accountName = account.accountName;
    vendor = account.vendor;
    monthlyRetainerCents = account.monthlyRetainerCents;
    feeBps = account.adSpendFeeBps;
    if (account.userId) {
      const user = await findUser(account.userId);
      if (user) {
        clientName = user.displayName;
        clientEmail = user.email;
        brand = user.payoutBrand ?? user.displayName;
      }
    }
  }

  // Apply overrides (used for free invoices and live recompute).
  if (accountNameOverride !== null) accountName = accountNameOverride;
  if (vendorOverride !== null) vendor = vendorOverride;
  if (Number.isFinite(feeOverride) && feeOverride > 0) feeBps = normalizeFeeBps(feeOverride);
  if (Number.isFinite(retainerOverride) && retainerOverride >= 0)
    monthlyRetainerCents = retainerOverride;

  const invoiceData = await generateAdAccountInvoiceData({
    clientName,
    clientEmail,
    invoiceNumber: generateClientInvoiceNumber(),
    paymentType,
    accountName,
    vendor,
    monthlyRetainerCents,
    spendCents: Number.isFinite(spendCents) && spendCents > 0 ? spendCents : 0,
    feeBps,
  });

  return NextResponse.json({
    data: {
      invoiceData,
      brand,
      account: adAccountId
        ? { id: adAccountId, accountName, vendor, monthlyRetainerCents, feeBps }
        : null,
    },
  });
}
