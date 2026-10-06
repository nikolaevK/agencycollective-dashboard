import { describe, expect, it } from "vitest";
import { unclaimedBrandHistories } from "@/lib/clientDirectory";
import { normalizeBrandName, type BrandHistory } from "@/lib/payouts";
import type { UserRecord } from "@/lib/users";

// The add-from-payout pool must treat a brand as "claimed" by exactly the rule
// the directory uses to attribute payouts (matchHistories) — otherwise a new
// brand is hidden behind an unrelated client's display name, or offered again
// while another client already bills it.

function user(overrides: Partial<UserRecord>): UserRecord {
  return {
    id: "u1",
    slug: "u1",
    accountId: "",
    displayName: "Client",
    logoPath: null,
    passwordHash: null,
    email: null,
    status: "active",
    mrr: 0,
    category: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    analystEnabled: true,
    designBoardEnabled: true,
    designBoardUrl: null,
    joinedAt: null,
    payoutBrand: null,
    workspace: "main",
    ...overrides,
  };
}

function history(brand: string): BrandHistory {
  return {
    normalizedName: normalizeBrandName(brand),
    displayBrand: brand,
    earliestDateJoined: "2026-10-05",
    months: [{ year: 2026, month: 10, amountDue: 100, amountPaid: 100 }],
    totalPaid: 100,
    latestMonth: { year: 2026, month: 10, amountDue: 100, amountPaid: 100 },
    latestAmountDue: 100,
    vertical: null,
    service: null,
  };
}

const names = (hs: BrandHistory[]) => hs.map((h) => h.displayBrand);

describe("unclaimedBrandHistories", () => {
  it("a linked client's display name does not swallow another brand", () => {
    const users = [user({ displayName: "Nextgen", payoutBrand: "NextGen Peptides" })];
    const hs = [history("NextGen Peptides"), history("NextGen BioLabs")];
    expect(names(unclaimedBrandHistories(users, hs))).toEqual(["NextGen BioLabs"]);
  });

  it("an unlinked main-book client still claims fuzzy name matches", () => {
    const users = [user({ displayName: "Nextgen" })];
    const hs = [history("NextGen Peptides"), history("Other Brand")];
    expect(names(unclaimedBrandHistories(users, hs))).toEqual(["Other Brand"]);
  });

  it("partner-book clients claim only their exact link", () => {
    const users = [user({ displayName: "Glow", workspace: "partner" })];
    expect(names(unclaimedBrandHistories(users, [history("Inner Glow")]))).toEqual(["Inner Glow"]);
    const linked = [user({ displayName: "Glow", workspace: "partner", payoutBrand: "Glow Co" })];
    expect(unclaimedBrandHistories(linked, [history("Glow")])).toEqual([]);
  });
});
