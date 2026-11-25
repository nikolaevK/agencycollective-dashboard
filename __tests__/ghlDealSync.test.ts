import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory deals + contracts; every GHL side effect is recorded in `calls`
// (in order) so the tests can assert WHAT is written and in WHICH order.
type Contract = { status: string; signingUrl: string | null; sentAt: string | null; signedAt?: string | null };
type Deal = { id: string; clientEmail: string | null; clientName: string; dealValue: number; paidStatus: string; googleEventId: string | null };

const store = {
  deals: new Map<string, Deal>(),
  contracts: new Map<string, Contract[]>(),
};
let calls: Array<[string, unknown]> = [];
let onFieldWrite: (() => void) | null = null;
let target: { contactId: string; subAccountId: string; via: string } | null = null;
// Per-deal GHL contact override (default: `target`).
let targetByDeal: Record<string, { contactId: string; subAccountId: string; via: string } | null> = {};

vi.mock("@vercel/functions", () => ({ waitUntil: () => {} }));
vi.mock("@/lib/ghl/subAccounts", () => ({ isAnyGhlConfigured: () => true }));
vi.mock("@/lib/ghl/client", () => ({ describeError: (e: unknown) => String(e) }));
// The sub-account's contact fields (by name; id = "id:<name>"), as set up live.
const SETUP_FIELDS = ["Proposal Link", "Proposal Link 2", "Proposal Status", "Proposal Value", "Proposal Sent Date"];
let ghlFields: string[] = [];
let refuseCreate = false;
vi.mock("@/lib/ghl/customFields", () => ({
  listContactFields: async () => ghlFields.map((name) => ({ id: `id:${name}`, name })),
  createContactTextField: async (name: string, sub: string) => {
    calls.push(["createField", `${sub}:${name}`]);
    if (refuseCreate) throw new Error("403 scope");
    ghlFields.push(name);
    return { id: `id:${name}`, name };
  },
  updateContactCustomFields: async (_c: string, values: Array<{ id: string; value: string | number }>) => {
    calls.push(["fields", Object.fromEntries(values.map((v) => [v.id.slice(3), v.value]))]);
    onFieldWrite?.();
    return new Map(values.map((v) => [v.id, String(v.value)]));
  },
}));
vi.mock("@/lib/ghlCrmSync", () => ({
  resolveDealGhlContact: async (id: { dealId: string }) => {
    calls.push(["resolve", id.dealId]);
    return id.dealId in targetByDeal ? targetByDeal[id.dealId] : target;
  },
  applyTags: async (_t: unknown, add: string[], remove: string[]) => calls.push(["tags", { add, remove }]),
  syncTargetActiveClient: async () => calls.push(["activeClient", null]),
  syncTargetWon: async (_t: unknown, lead: unknown) => calls.push(["won", lead]),
}));
vi.mock("@/lib/deals", () => ({ findDeal: async (id: string) => store.deals.get(id) ?? null }));
vi.mock("@/lib/dealContracts", () => ({
  findDealContractByDealId: async (id: string) => store.contracts.get(id)?.[0] ?? null,
}));
vi.mock("@/lib/dealAdditionalContracts", () => ({
  findAdditionalContractsByDealId: async (id: string) => store.contracts.get(id)?.slice(1) ?? [],
}));
// drivingDealId's SQL, answered from the store: latest sent_at / signed_at
// among deals sharing the email (excluding the 2nd arg).
vi.mock("@/lib/db", () => ({
  ensureMigrated: async () => {},
  getDb: () => ({
    execute: async ({ args }: { args: string[] }) => {
      const [email, exclude] = args;
      let best: { id: string; last: string } | null = null;
      for (const d of Array.from(store.deals.values())) {
        if (d.id === exclude || (d.clientEmail ?? "").toLowerCase() !== email.toLowerCase()) continue;
        for (const c of store.contracts.get(d.id) ?? []) {
          for (const t of [c.sentAt, c.signedAt]) {
            if (t && (!best || t > best.last)) best = { id: d.id, last: t };
          }
        }
      }
      return { rows: best ? [{ id: best.id, last_sent: best.last }] : [] };
    },
  }),
}));

const { syncDealToGhl, snapshotDealForGhl, scheduleDeletedDealGhlSync } = await import("@/lib/ghlDealSync");

const LINK_A = "https://docuseal.com/s/aaa";
const LINK_B = "https://docuseal.com/s/bbb";

function addDeal(id: string, over: Partial<Deal> = {}, contracts: Contract[] = []) {
  store.deals.set(id, { id, clientEmail: "lead@x.com", clientName: "Lead", dealValue: 1_100_000, paidStatus: "unpaid", googleEventId: null, ...over });
  store.contracts.set(id, contracts);
}
const kinds = () => calls.map(([k]) => k);
const tagCalls = () => calls.filter(([k]) => k === "tags").map(([, v]) => v);

beforeEach(() => {
  store.deals.clear();
  store.contracts.clear();
  calls = [];
  ghlFields = [...SETUP_FIELDS];
  refuseCreate = false;
  onFieldWrite = null;
  target = { contactId: "c1", subAccountId: "peptide", via: "event" };
  targetByDeal = {};
});
const resolvedDeals = () => calls.filter(([k]) => k === "resolve").map(([, v]) => v);

describe("syncDealToGhl", () => {
  it("sent: fields (link, status, value, date) BEFORE tags; no opportunity write", async () => {
    addDeal("d1", {}, [{ status: "sent", signingUrl: LINK_A, sentAt: "2026-11-25T18:00:00.000Z" }]);
    await syncDealToGhl("d1");
    expect(kinds()).toEqual(["resolve", "fields", "tags"]);
    expect(calls[1][1]).toEqual({ "Proposal Status": "Sent", "Proposal Value": 11_000, "Proposal Link": LINK_A, "Proposal Link 2": "", "Proposal Sent Date": "2026-11-25" });
    expect(tagCalls()[0]).toMatchObject({ add: ["proposal_sent"] });
  });

  it("signed: status field, then Won with the deal value, then the signed tag", async () => {
    addDeal("d1", {}, [{ status: "signed", signingUrl: LINK_A, sentAt: "2026-11-25T18:00:00.000Z" }]);
    await syncDealToGhl("d1");
    expect(kinds()).toEqual(["resolve", "fields", "won", "tags"]);
    expect(calls[2][1]).toEqual({ leadName: "Lead", dealValueCents: 1_100_000 });
    expect(tagCalls()[0]).toMatchObject({ add: ["proposal_signed"] });
  });

  it("paid: promotes to Active Client instead of a bare Won", async () => {
    addDeal("d1", { paidStatus: "paid" }, [{ status: "signed", signingUrl: LINK_A, sentAt: "2026-11-25T18:00:00.000Z" }]);
    await syncDealToGhl("d1");
    expect(kinds()).toContain("activeClient");
    expect(kinds()).not.toContain("won");
  });

  it("a deal never sent makes no GHL call at all", async () => {
    addDeal("d1", {}, [{ status: "pending", signingUrl: null, sentAt: null }]);
    await syncDealToGhl("d1");
    expect(calls).toEqual([]);
  });

  it("an event on an OLDER deal mirrors the lead's most recently sent deal", async () => {
    addDeal("old", {}, [{ status: "expired", signingUrl: LINK_A, sentAt: "2026-11-02T18:00:00.000Z" }]);
    addDeal("new", { clientEmail: "LEAD@x.com" }, [{ status: "signed", signingUrl: LINK_B, sentAt: "2026-11-20T18:00:00.000Z" }]);
    await syncDealToGhl("old");
    expect(resolvedDeals()).toEqual(["old", "new"]);
    expect(calls.find(([k]) => k === "fields")?.[1]).toMatchObject({ "Proposal Status": "Signed" });
    expect(tagCalls()).toEqual([expect.objectContaining({ add: ["proposal_signed"] })]);
    expect(tagCalls().some((t) => (t as { add: string[] }).add.includes("proposal_expired"))).toBe(false);
  });

  it("the lead signing an OLDER deal's still-live link after a newer send takes over", async () => {
    addDeal("old", {}, [{ status: "signed", signingUrl: LINK_A, sentAt: "2026-11-02T18:00:00.000Z", signedAt: "2026-11-24T18:00:00.000Z" }]);
    addDeal("new", {}, [{ status: "sent", signingUrl: LINK_B, sentAt: "2026-11-20T18:00:00.000Z" }]);
    await syncDealToGhl("new");
    expect(calls.find(([k]) => k === "fields")?.[1]).toMatchObject({ "Proposal Status": "Signed" });
    expect(kinds()).toContain("won");
  });

  it("a newer deal for the same email on a DIFFERENT GHL contact never takes over", async () => {
    addDeal("pep", {}, [{ status: "signed", signingUrl: LINK_A, sentAt: "2026-11-01T18:00:00.000Z", signedAt: "2026-11-03T18:00:00.000Z" }]);
    addDeal("agy", {}, [{ status: "sent", signingUrl: LINK_B, sentAt: "2026-11-05T18:00:00.000Z" }]);
    targetByDeal = { agy: { contactId: "cA", subAccountId: "agency", via: "event" } };
    await syncDealToGhl("pep");
    expect(calls.find(([k]) => k === "fields")?.[1]).toMatchObject({ "Proposal Status": "Signed" });
    expect(tagCalls()[0]).toMatchObject({ add: ["proposal_signed"] });
  });

  it("the last pass still writes tags when the deal keeps moving", async () => {
    addDeal("d1", {}, [{ status: "sent", signingUrl: LINK_A, sentAt: "2026-11-25T18:00:00.000Z" }]);
    let flip = 0;
    onFieldWrite = () => {
      flip++;
      store.contracts.set("d1", [{ status: flip % 2 ? "viewed" : "sent", signingUrl: LINK_A, sentAt: "2026-11-25T18:00:00.000Z" }]);
    };
    await syncDealToGhl("d1");
    expect(tagCalls().length).toBeGreaterThanOrEqual(1);
  });

  it("a run that goes stale mid-write never applies its old tags", async () => {
    addDeal("d1", {}, [{ status: "viewed", signingUrl: LINK_A, sentAt: "2026-11-25T18:00:00.000Z" }]);
    // The signature webhook lands while this (viewed) run writes the fields.
    onFieldWrite = () => {
      onFieldWrite = null;
      store.contracts.set("d1", [{ status: "signed", signingUrl: LINK_A, sentAt: "2026-11-25T18:00:00.000Z" }]);
    };
    await syncDealToGhl("d1");
    const tags = tagCalls();
    expect(tags).toHaveLength(1);
    expect(tags[0]).toMatchObject({ add: ["proposal_signed"] });
  });

  it("not in GHL → only the lookup", async () => {
    target = null;
    addDeal("d1", {}, [{ status: "sent", signingUrl: LINK_A, sentAt: "2026-11-25T18:00:00.000Z" }]);
    await syncDealToGhl("d1");
    expect(kinds()).toEqual(["resolve"]);
  });

  it("clearIfNone after the only sent contract was replaced: clears links/status, drops open tags", async () => {
    addDeal("d1", {}, [{ status: "pending", signingUrl: null, sentAt: null }]);
    await syncDealToGhl("d1", { clearIfNone: true });
    expect(calls[1]).toEqual(["fields", { "Proposal Link": "", "Proposal Link 2": "", "Proposal Status": "" }]);
    expect(tagCalls()[0]).toEqual({ add: [], remove: ["proposal_sent", "proposal_viewed"] });
  });
});

describe("any number of contracts", () => {
  const SENT = "2026-11-25T18:00:00.000Z";
  const LINK_C = "https://docuseal.com/s/ccc";
  const three = (status = "sent") => [
    { status, signingUrl: LINK_A, sentAt: SENT },
    { status: "sent", signingUrl: LINK_B, sentAt: SENT },
    { status: "viewed", signingUrl: LINK_C, sentAt: SENT },
  ];

  it("three open contracts → Proposal Link, 2 and 3 (the missing field is created first)", async () => {
    addDeal("d1", {}, three());
    await syncDealToGhl("d1");
    expect(kinds()).toEqual(["resolve", "createField", "fields", "tags"]);
    expect(calls[1][1]).toBe("peptide:Proposal Link 3");
    expect(calls[2][1]).toMatchObject({ "Proposal Link": LINK_A, "Proposal Link 2": LINK_B, "Proposal Link 3": LINK_C });
  });

  it("an existing link field is reused, and slots no longer used are cleared", async () => {
    ghlFields.push("Proposal Link 3", "Proposal Link 4");
    addDeal("d1", {}, [{ status: "sent", signingUrl: LINK_A, sentAt: SENT }, { status: "sent", signingUrl: LINK_B, sentAt: SENT }]);
    await syncDealToGhl("d1");
    expect(kinds()).not.toContain("createField");
    expect(calls.find(([k]) => k === "fields")?.[1]).toMatchObject({
      "Proposal Link": LINK_A,
      "Proposal Link 2": LINK_B,
      "Proposal Link 3": "",
      "Proposal Link 4": "",
    });
  });

  it("after an outcome no link field is touched (or created)", async () => {
    addDeal("d1", {}, three("signed"));
    await syncDealToGhl("d1");
    expect(kinds()).not.toContain("createField");
    const written = calls.find(([k]) => k === "fields")?.[1] as Record<string, unknown>;
    expect(Object.keys(written).some((k) => k.startsWith("Proposal Link"))).toBe(false);
  });

  it("GHL refusing to create a field still writes the other links — and isn't retried on every sync", async () => {
    target = { contactId: "c1", subAccountId: "agency", via: "event" };
    refuseCreate = true;
    addDeal("d1", {}, three());
    await syncDealToGhl("d1");
    expect(calls.find(([k]) => k === "fields")?.[1]).toMatchObject({ "Proposal Link": LINK_A, "Proposal Link 2": LINK_B });
    expect(calls.find(([k]) => k === "fields")?.[1]).not.toHaveProperty("Proposal Link 3");
    expect(tagCalls()).toHaveLength(1);
    calls = [];
    await syncDealToGhl("d1");
    expect(kinds()).not.toContain("createField");
  });
});

describe("deal deletion", () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("deleting a deal with an OPEN proposal and no other deal clears the lead", async () => {
    addDeal("d1", {}, [{ status: "viewed", signingUrl: LINK_A, sentAt: "2026-11-25T18:00:00.000Z" }]);
    const snap = await snapshotDealForGhl("d1");
    store.deals.delete("d1");
    store.contracts.delete("d1");
    scheduleDeletedDealGhlSync(snap);
    await flush(); await flush(); await flush();
    expect(calls.find(([k]) => k === "fields")?.[1]).toEqual({ "Proposal Link": "", "Proposal Link 2": "", "Proposal Status": "" });
    expect(tagCalls()[0]).toEqual({ add: [], remove: ["proposal_sent", "proposal_viewed"] });
  });

  it("deleting it hands the lead to their next most recently sent deal", async () => {
    addDeal("d1", {}, [{ status: "sent", signingUrl: LINK_A, sentAt: "2026-11-25T18:00:00.000Z" }]);
    addDeal("d0", {}, [{ status: "viewed", signingUrl: LINK_B, sentAt: "2026-11-10T18:00:00.000Z" }]);
    const snap = await snapshotDealForGhl("d1");
    store.deals.delete("d1");
    store.contracts.delete("d1");
    scheduleDeletedDealGhlSync(snap);
    for (let i = 0; i < 8; i++) await flush();
    expect(calls.find(([k]) => k === "fields")?.[1]).toMatchObject({ "Proposal Status": "Viewed", "Proposal Link": LINK_B });
  });

  it("a next deal on a DIFFERENT contact doesn't stand in — the deleted deal's contact is cleared", async () => {
    addDeal("d1", {}, [{ status: "sent", signingUrl: LINK_A, sentAt: "2026-11-25T18:00:00.000Z" }]);
    addDeal("d0", {}, [{ status: "viewed", signingUrl: LINK_B, sentAt: "2026-11-10T18:00:00.000Z" }]);
    targetByDeal = { d0: { contactId: "other", subAccountId: "agency", via: "event" } };
    const snap = await snapshotDealForGhl("d1");
    store.deals.delete("d1");
    store.contracts.delete("d1");
    scheduleDeletedDealGhlSync(snap);
    await flush(); await flush(); await flush(); await flush();
    expect(calls.find(([k]) => k === "fields")?.[1]).toEqual({ "Proposal Link": "", "Proposal Link 2": "", "Proposal Status": "" });
  });

  it("deleting a deal whose proposal was signed (or never sent) touches nothing", async () => {
    addDeal("d1", {}, [{ status: "signed", signingUrl: LINK_A, sentAt: "2026-11-25T18:00:00.000Z" }]);
    const snap = await snapshotDealForGhl("d1");
    scheduleDeletedDealGhlSync(snap);
    await flush();
    expect(calls).toEqual([]);
  });
});
