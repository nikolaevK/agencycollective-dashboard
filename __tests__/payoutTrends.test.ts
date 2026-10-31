import { describe, it, expect } from "vitest";
import {
  brandBreakdown,
  payoutRevenueMix,
  salesRepBreakdown,
  type PayoutRecord,
} from "@/lib/payouts";

function payout(brandName: string, amountDue: number, salesRep: string | null, amountPaid = amountDue): PayoutRecord {
  return {
    id: `${brandName}-${amountDue}`,
    payoutMonth: 9,
    payoutYear: 2026,
    dateJoined: null,
    firstDayAdSpend: null,
    brandName,
    vertical: null,
    pointOfContact: null,
    service: null,
    isSigned: true,
    isPaid: true,
    addedToSlack: true,
    amountDue,
    amountPaid,
    paymentNotes: null,
    salesRep,
    payDistributed: "Yes",
    payDistributedDate: null,
    commissionSplit: false,
    splitDetails: [],
    referral: null,
    referralPct: null,
    sourceDealId: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("payoutRevenueMix", () => {
  it("splits rows into new, rebill and ad account, summing to the total due", () => {
    const rows = [
      payout("Acme Peptides", 650_000, "Gabriel C"),
      payout("Northwind Labs", 8_400_000, "REBILL"),
      // Same brand as a REBILL row → rebill stream, even without the flag.
      payout("Northwind Labs LLC", 100_000, null),
      payout("Northwind Labs", 79_400, "Ad Account"),
      payout("Globex", 1_400, "ad account"),
    ];
    const mix = payoutRevenueMix(rows);
    expect(mix).toEqual({ new: 650_000, rebill: 8_500_000, adAccount: 80_800 });
    expect(mix.new + mix.rebill + mix.adAccount).toBe(rows.reduce((s, r) => s + r.amountDue, 0));
  });

  it("is all zeros for an empty month", () => {
    expect(payoutRevenueMix([])).toEqual({ new: 0, rebill: 0, adAccount: 0 });
  });
});

describe("brandBreakdown", () => {
  it("groups fuzzy brand variants and sorts by amount due", () => {
    const b = brandBreakdown([
      payout("Inner Glow", 300_000, null),
      payout("Northwind", 900_000, "REBILL", 400_000),
      payout("inner glow llc", 200_000, "Ad Account"),
    ]);
    expect(b.map((x) => [x.name, x.amountDue, x.count])).toEqual([
      ["Northwind", 900_000, 1],
      ["Inner Glow", 500_000, 2],
    ]);
    expect(b[0].amountPaid).toBe(400_000);
  });
});

describe("salesRepBreakdown", () => {
  it("credits only the mix's New stream (a rebilling brand's upsell isn't new)", () => {
    const rows = [
      payout("Acme", 500_000, "REBILL"),
      payout("Acme", 150_000, "John"),
      payout("Globex", 300_000, "Jane"),
      payout("Globex", 20_000, "Ad Account"),
    ];
    const reps = salesRepBreakdown(rows);
    expect(reps.map((x) => [x.name, x.amountDue])).toEqual([["Jane", 300_000]]);
    expect(reps.reduce((s, x) => s + x.amountDue, 0)).toBe(payoutRevenueMix(rows).new);
  });

  it("credits people, drops marker rows and names blanks Unassigned", () => {
    const r = salesRepBreakdown([
      payout("A", 650_000, "Gabriel C"),
      payout("B", 1_200_000, "gabriel c "),
      payout("C", 650_000, null),
      payout("D", 8_400_000, "REBILL"),
      payout("E", 24_600, "Ad Account"),
    ]);
    expect(r.map((x) => [x.name, x.amountDue, x.count])).toEqual([
      ["Gabriel C", 1_850_000, 2],
      ["Unassigned", 650_000, 1],
    ]);
  });
});
