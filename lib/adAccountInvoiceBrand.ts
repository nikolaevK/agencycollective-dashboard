import { findUser } from "./users";
import type { AdAccount } from "./adAccounts";
import type { AdAccountInvoice } from "./adAccountInvoices";

/**
 * The brand an ad-account invoice's payouts are matched under, and whether
 * matching must be exact (partner books — see lib/adAccountDirectory.ts
 * adAccountMonthsForBrand). Shared by the manual-override PATCH route and the
 * payout-options picker so the picker never offers a row the PATCH rejects.
 * Free invoices (no account) fall back to the brand snapshot on the row.
 */
export async function resolveAdInvoiceBrand(
  invoice: AdAccountInvoice,
  account: AdAccount | null
): Promise<{ brand: string | null; exactOnly: boolean }> {
  if (!account) return { brand: invoice.brand, exactOnly: false };
  const exactOnly = account.workspace !== "main";
  if (!account.userId) return { brand: exactOnly ? null : invoice.brand, exactOnly };
  const user = await findUser(account.userId);
  if (!user) return { brand: exactOnly ? null : invoice.brand, exactOnly };
  return {
    brand: exactOnly ? user.payoutBrand : user.payoutBrand ?? user.displayName,
    exactOnly,
  };
}
