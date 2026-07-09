export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { tokenHasResource } from "@/lib/apiScopes";
import { getAdAccount, normalizeFeeBps } from "@/lib/adAccounts";
import { findUser } from "@/lib/users";
import { generateClientInvoiceNumber } from "@/lib/clientInvoice";
import { generateAdAccountInvoiceData } from "@/lib/adAccountInvoice";

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Prefilled ad-account invoice draft (retainer + ad-spend-fee lines).
 * Query: ?adAccountId&spendCents&feeBps&retainerCents&accountName&vendor
 * &paymentType=local|international. Draft only — sending is excluded.
 */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "client:read");
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const paymentType =
      searchParams.get("paymentType") === "international" ? "international" : "local";
    const spendCents = Number(searchParams.get("spendCents"));
    const adAccountId = searchParams.get("adAccountId");
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
      const account = await getAdAccount(adAccountId);
      if (!account) return fail("not_found", "Ad account not found", 404);
      if (!tokenHasResource(auth.token, "client", account.userId)) {
        return fail("resource_forbidden", "This token is not allowed to access this client", 403);
      }
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

    if (accountNameOverride !== null) accountName = accountNameOverride;
    if (vendorOverride !== null) vendor = vendorOverride;
    if (Number.isFinite(feeOverride) && feeOverride > 0) feeBps = normalizeFeeBps(feeOverride);
    if (Number.isFinite(retainerOverride) && retainerOverride >= 0) {
      monthlyRetainerCents = retainerOverride;
    }

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

    return ok({
      invoiceData,
      brand,
      account: adAccountId
        ? { id: adAccountId, accountName, vendor, monthlyRetainerCents, feeBps }
        : null,
    });
  } catch (err) {
    console.error("GET /api/v1/client/ad-accounts/invoice/prefill error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
