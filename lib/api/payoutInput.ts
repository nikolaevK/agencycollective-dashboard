import type { PayDistributed, PayoutRecord, SplitParty } from "@/lib/payouts";

/**
 * Shared v1 payout-body validation (POST / PATCH / import-from-deal).
 * Mirrors the admin payout routes' limits, except money is integer CENTS
 * (the v1 convention — responses return cents, so requests take cents).
 */

const MAX_TEXT = 500;
const MAX_NOTES = 2000;
const MAX_DATE = 20;
/** $10M in cents. */
const MAX_AMOUNT_CENTS = 10_000_000 * 100;
const VALID_DISTRIBUTED: PayDistributed[] = ["Yes", "No", "Hold Til Full Pay"];

export function trimStr(val: unknown, max: number): string | null {
  if (!val) return null;
  const s = String(val).trim();
  return s ? s.slice(0, max) : null;
}

export type PayoutFieldErrors = string;

/**
 * Validate + normalize the writable payout fields present in `body`.
 * Returns { changes } with only the provided fields, or { error }.
 */
export function parsePayoutFields(
  body: Record<string, unknown>
): { changes: Partial<Omit<PayoutRecord, "id">>; error?: undefined } | { error: string } {
  const changes: Partial<Omit<PayoutRecord, "id">> = {};

  if (body.payoutMonth !== undefined || body.payoutYear !== undefined) {
    const month = Number(body.payoutMonth);
    const year = Number(body.payoutYear);
    if (
      !Number.isInteger(month) || month < 1 || month > 12 ||
      !Number.isInteger(year) || year < 2000 || year > 2100
    ) {
      return { error: "payoutMonth (1-12) and payoutYear (2000-2100) must be provided together" };
    }
    changes.payoutMonth = month;
    changes.payoutYear = year;
  }
  if (body.brandName !== undefined) {
    const brandName = String(body.brandName ?? "").trim().slice(0, MAX_TEXT);
    if (!brandName) return { error: "brandName cannot be empty" };
    changes.brandName = brandName;
  }
  if (body.amountDue !== undefined) {
    const cents = Number(body.amountDue);
    if (!Number.isInteger(cents) || cents < 0 || cents > MAX_AMOUNT_CENTS) {
      return { error: "amountDue must be an integer amount in cents" };
    }
    changes.amountDue = cents;
  }
  if (body.amountPaid !== undefined) {
    const cents = Number(body.amountPaid);
    if (!Number.isInteger(cents) || cents < 0 || cents > MAX_AMOUNT_CENTS) {
      return { error: "amountPaid must be an integer amount in cents" };
    }
    changes.amountPaid = cents;
  }
  if (body.payDistributed !== undefined) {
    const pd = body.payDistributed as PayDistributed;
    if (!VALID_DISTRIBUTED.includes(pd)) {
      return { error: "payDistributed must be Yes, No, or Hold Til Full Pay" };
    }
    changes.payDistributed = pd;
  }
  if (body.commissionSplit !== undefined || body.splitDetails !== undefined) {
    const commissionSplit = Boolean(body.commissionSplit);
    let splitDetails: SplitParty[] = [];
    if (commissionSplit) {
      if (!Array.isArray(body.splitDetails)) {
        return { error: "Split requires at least 2 parties" };
      }
      splitDetails = body.splitDetails
        .slice(0, 20)
        .filter((p: unknown): p is { name?: string; pct?: number } => Boolean(p) && typeof p === "object")
        .map((p) => ({
          name: String(p.name ?? "").trim().slice(0, MAX_TEXT),
          pct: Number(p.pct ?? 0),
        }))
        .filter((p) => p.name);
      if (splitDetails.length < 2) {
        return { error: "Split requires at least 2 parties" };
      }
      if (splitDetails.some((p) => !Number.isFinite(p.pct) || p.pct < 0 || p.pct > 100)) {
        return { error: "Split pct must be a number between 0 and 100" };
      }
    }
    changes.commissionSplit = commissionSplit;
    changes.splitDetails = splitDetails;
  }
  if (body.referralPct !== undefined) {
    if (body.referralPct === null) {
      changes.referralPct = null;
    } else {
      const pct = Number(body.referralPct);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        return { error: "referralPct must be a number between 0 and 100" };
      }
      changes.referralPct = Math.round(pct);
    }
  }

  if (body.dateJoined !== undefined) changes.dateJoined = trimStr(body.dateJoined, MAX_DATE);
  if (body.firstDayAdSpend !== undefined) changes.firstDayAdSpend = trimStr(body.firstDayAdSpend, MAX_DATE);
  if (body.vertical !== undefined) changes.vertical = trimStr(body.vertical, MAX_TEXT);
  if (body.pointOfContact !== undefined) changes.pointOfContact = trimStr(body.pointOfContact, MAX_TEXT);
  if (body.service !== undefined) changes.service = trimStr(body.service, MAX_TEXT);
  if (body.paymentNotes !== undefined) changes.paymentNotes = trimStr(body.paymentNotes, MAX_NOTES);
  if (body.salesRep !== undefined) changes.salesRep = trimStr(body.salesRep, MAX_TEXT);
  if (body.payDistributedDate !== undefined) changes.payDistributedDate = trimStr(body.payDistributedDate, MAX_DATE);
  if (body.referral !== undefined) changes.referral = trimStr(body.referral, MAX_TEXT);
  if (body.isSigned !== undefined) changes.isSigned = Boolean(body.isSigned);
  if (body.isPaid !== undefined) changes.isPaid = Boolean(body.isPaid);
  if (body.addedToSlack !== undefined) changes.addedToSlack = Boolean(body.addedToSlack);

  return { changes };
}
