import { beforeEach, describe, expect, it, vi } from "vitest";

// buildAnalystContext with the Meta layer faked: ordering, per-section
// budgets, the scope line, and the cap on concurrent Meta reads.

interface FakeAccount {
  id: string;
  name: string;
  status: string;
  currency: string;
  insights: { spend: number; impressions: number };
}

let accounts: FakeAccount[] = [];
let inFlight = 0;
let maxInFlight = 0;
let metaCalls = 0;

/** A Meta read that takes a few ms and records how many run at once. */
async function metaRead<T>(value: T): Promise<T> {
  metaCalls++;
  inFlight++;
  maxInFlight = Math.max(maxInFlight, inFlight);
  await new Promise((r) => setTimeout(r, 2));
  inFlight--;
  return value;
}

const campaignsOf = (accountId: string) =>
  Array.from({ length: 10 }, (_, i) => ({ id: `${accountId}_c${i}`, name: `${accountId} campaign ${i}`, status: "ACTIVE", insights: { spend: 100 - i } }));

vi.mock("@/lib/chatContext", () => ({
  getAccountSummaries: async () => accounts,
  formatAccountContext: (a: FakeAccount) => `**${a.name}** spend ${a.insights.spend} ${"·".repeat(380)}`,
  formatCampaignContext: (c: { name: string }) => `  - ${c.name} ${"·".repeat(300)}`,
  formatAdSetContext: (s: { name: string }) => `    - ${s.name}`,
}));
vi.mock("@/lib/meta/endpoints", () => ({
  fetchCampaigns: (id: string) => metaRead(campaignsOf(id)),
  fetchAdSets: (campaignId: string) =>
    metaRead([0, 1, 2, 3].map((i) => ({ id: `${campaignId}_s${i}`, name: `${campaignId} set ${i}`, insights: { spend: 10 - i } }))),
  fetchAds: () => metaRead([{ id: "ad", status: "ACTIVE" }]),
}));
vi.mock("@/lib/meta/transformers", () => ({
  transformCampaign: (x: unknown) => x,
  transformAdSet: (x: unknown) => x,
  transformAd: (x: unknown) => x,
}));
vi.mock("@/lib/meta/chatEndpoints", () => ({
  fetchDemographicBreakdown: () => metaRead([1]),
  fetchPlacementBreakdown: () => metaRead([1]),
  fetchAdSetLearningStages: () => metaRead([1]),
  fetchCustomConversions: () => metaRead([]),
  fetchConversionBreakdown: () => metaRead([1]),
  formatDemographicTable: (_r: unknown, name: string) => `\n## Age/Gender Breakdown — ${name}`,
  formatPlacementTable: (_r: unknown, name: string) => `\n## Placement Breakdown — ${name}`,
  formatLearningStages: (_r: unknown, name: string) => `\n## Learning — ${name}`,
  formatConversionBreakdown: (_r: unknown, name: string) => `\n## Conversion Events — ${name}`,
}));
vi.mock("@/lib/cache", () => ({
  default: { get: () => undefined, set: () => {} },
  CacheKeys: { campaigns: (id: string) => `campaigns:${id}` },
  TTL: { CAMPAIGNS: 60 },
}));

import { buildAnalystContext, META_CONCURRENCY } from "@/lib/analyst/context";

const account = (n: number, spend: number, status = "ACTIVE"): FakeAccount => ({
  id: `act_${n}`,
  name: `Account ${n}`,
  status,
  currency: "USD",
  insights: { spend, impressions: spend * 10 },
});

beforeEach(() => {
  inFlight = 0;
  maxInFlight = 0;
  metaCalls = 0;
});

describe("buildAnalystContext", () => {
  it("lists accounts by spend and keeps the top spenders' detail when the account list is long", async () => {
    // 60 active accounts in "Meta order" (lowest spend first) — far over the accounts budget.
    accounts = Array.from({ length: 60 }, (_, i) => account(i, i * 10));
    const ctx = await buildAnalystContext({ dateRange: { since: "2026-10-01", until: "2026-10-31" }, selectedAccountIds: [], selectedCampaignIds: [] });

    const listed = [...ctx.contextText.matchAll(/^\*\*Account (\d+)\*\* spend/gm)].map((m) => Number(m[1]));
    expect(listed[0]).toBe(59); // highest spend first
    expect(listed).toEqual([...listed].sort((a, b) => b - a));
    expect(listed.length).toBeLessThan(60);

    // The account list was cut, but the later sections still made it in.
    expect(ctx.contextText).toContain("## Campaigns");
    expect(ctx.contextText).toContain("act_59 campaign 0");
    expect(ctx.contextText).toContain("## Ad Sets & Ads");
    expect(ctx.contextText).toContain("## Age/Gender Breakdown — Account 59");
    expect(ctx.contextText.length).toBeLessThanOrEqual(48_000 + 2_000);

    // The scope line says what was actually included.
    expect(ctx.scope).toContain(`Accounts listed: ${listed.length} of 60, highest spend first (the rest were cut for length)`);
    const campaignAccounts = new Set([...ctx.contextText.matchAll(/^\n?\*\*(Account \d+)\*\* campaigns/gm)].map((m) => m[1])).size;
    expect(ctx.scope).toContain(`Campaign detail for ${campaignAccounts} account`);
    expect(campaignAccounts).toBeGreaterThan(0);
    expect(campaignAccounts).toBeLessThanOrEqual(5);
  });

  it("states complete inclusion plainly when everything fits", async () => {
    accounts = [account(1, 50), account(2, 500), account(3, 0, "DISABLED")];
    const ctx = await buildAnalystContext({ dateRange: { since: "2026-10-01", until: "2026-10-31" }, selectedAccountIds: [], selectedCampaignIds: [] });
    expect(ctx.contextText.indexOf("**Account 2**")).toBeLessThan(ctx.contextText.indexOf("**Account 1**"));
    expect(ctx.contextText).not.toContain("Account 3");
    expect(ctx.scope).toBe(
      "all 2 active accounts. Accounts listed: 2 of 2, highest spend first. Campaign detail for 2 accounts; ad sets for 2 accounts; breakdowns for 2 accounts — the highest-spending ones."
    );
    expect(ctx.knownAccountIds).toEqual(new Set(["act_1", "act_2", "act_3"]));
  });

  it(`never has more than ${META_CONCURRENCY} Meta reads in flight`, async () => {
    accounts = Array.from({ length: 8 }, (_, i) => account(i, 1_000 - i));
    await buildAnalystContext({ dateRange: { since: "2026-10-01", until: "2026-10-31" }, selectedAccountIds: [], selectedCampaignIds: [] });
    expect(metaCalls).toBeGreaterThan(20); // a cold build fans out widely…
    expect(maxInFlight).toBeLessThanOrEqual(META_CONCURRENCY); // …but only this many at a time
    expect(maxInFlight).toBeGreaterThan(1);
  });
});
