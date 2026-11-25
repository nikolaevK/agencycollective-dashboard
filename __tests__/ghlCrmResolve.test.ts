import { beforeEach, describe, expect, it, vi } from "vitest";

// resolveDealGhlContact: which GHL contact a deal is written to. Wrong answers
// here put one client's signing link on another person's contact, so every
// fallback is pinned down.
let eventLink: { ghlContactId: string | null; subAccountId: string } | null = null;
let relatedRows: Array<{ google_event_id: string }> = [];
let relatedLinks: Record<string, { ghlContactId: string | null; subAccountId: string }> = {};
let emailHits: Record<string, string | null | Error> = {};
let contactEmails: Record<string, string> = {};
let configured = ["agency", "peptide"];
const sqlArgs: unknown[][] = [];
type Opp = { id: string; status: string; pipelineId: string; pipelineStageId: string; name: string; monetaryValue: number | null };
let existingOpp: Opp | null = null;
let ghlCalls: Array<[string, unknown]> = [];
const STAGES: Record<string, string> = { "Showed didn't close": "s-sdc", "Active Client": "s-ac" };

vi.mock("@/lib/ghl/client", () => ({
  describeError: (e: unknown) => String(e),
  isGhlConfigured: (sub?: string) => (sub ? configured.includes(sub) : configured.length > 0),
}));
vi.mock("@/lib/ghl/subAccounts", () => ({
  getConfiguredSubAccountIds: () => configured,
  SUB_ACCOUNTS: [{ id: "agency" }, { id: "peptide" }],
}));
vi.mock("@/lib/attendanceSync", () => ({ ensureLinkForEvent: async () => eventLink }));
vi.mock("@/lib/ghlAppointmentLinks", () => ({ listLinksByGoogleEventIds: async () => relatedLinks }));
vi.mock("@/lib/ghl/contacts", () => ({
  findContactByEmail: async (_e: string, sub: string) => {
    const hit = emailHits[sub];
    if (hit instanceof Error) throw hit;
    return hit ? { id: hit } : null;
  },
  addContactTags: async (_c: string, tags: string[]) => { ghlCalls.push(["addTags", tags]); return []; },
  removeContactTags: async (_c: string, tags: string[]) => { ghlCalls.push(["removeTags", tags]); return []; },
  getContactById: async (id: string) =>
    contactEmails[id] === undefined ? null : { id, email: contactEmails[id], additionalEmails: [] },
}));
vi.mock("@/lib/ghl/pipelines", () => ({
  resolvePipelineStageByName: async (pipelineName: string, stageName: string) =>
    STAGES[stageName] ? { pipelineId: "p-" + pipelineName, pipelineName, pipelineStageId: STAGES[stageName], stageName } : null,
}));
vi.mock("@/lib/ghl/opportunities", () => ({
  findOpportunityForContactInPipeline: async () => existingOpp,
  updateOpportunity: async (id: string, input: unknown) => { ghlCalls.push(["update", { id, ...(input as object) }]); return null; },
  createOpportunity: async (input: unknown) => { ghlCalls.push(["create", input]); return null; },
}));
vi.mock("@/lib/db", () => ({
  ensureMigrated: async () => {},
  getDb: () => ({
    execute: async ({ args }: { args: unknown[] }) => {
      sqlArgs.push(args);
      return { rows: relatedRows };
    },
  }),
}));

const { resolveDealGhlContact, bestEffortSyncShowedDidntClose, bestEffortSyncActiveClient, syncTargetWon, syncTargetActiveClient } =
  await import("@/lib/ghlCrmSync");

beforeEach(() => {
  eventLink = null;
  relatedRows = [];
  relatedLinks = {};
  emailHits = {};
  contactEmails = {};
  configured = ["agency", "peptide"];
  sqlArgs.length = 0;
  existingOpp = null;
  ghlCalls = [];
});

describe("resolveDealGhlContact", () => {
  it("the deal's own event link wins", async () => {
    eventLink = { ghlContactId: "own", subAccountId: "peptide" };
    emailHits = { agency: "other" };
    expect(await resolveDealGhlContact({ dealId: "d", googleEventId: "e", clientEmail: "a@b.com" })).toEqual({
      contactId: "own",
      subAccountId: "peptide",
      via: "event",
    });
  });

  it("closer-portal calls (event only, no deal id/email) never fall back", async () => {
    emailHits = { peptide: "someone" };
    expect(await resolveDealGhlContact({ googleEventId: "e" })).toBeNull();
    expect(sqlArgs).toHaveLength(0);
  });

  it("an existing but unusable event link never falls back to another lookup", async () => {
    emailHits = { agency: null, peptide: "p" };
    for (const link of [{ ghlContactId: "own", subAccountId: "agency" }, { ghlContactId: null, subAccountId: "peptide" }]) {
      configured = link.ghlContactId ? ["peptide"] : ["agency", "peptide"];
      eventLink = link;
      expect(await resolveDealGhlContact({ dealId: "d", googleEventId: "e", clientEmail: "a@b.com" })).toBeNull();
    }
  });

  it("a recreated deal reaches its lead through the original deal's event, excluding itself", async () => {
    relatedRows = [{ google_event_id: "e-old" }];
    relatedLinks = { "e-old": { ghlContactId: "lead", subAccountId: "peptide" } };
    contactEmails = { lead: "manny@x.com" };
    expect(await resolveDealGhlContact({ dealId: "new", clientEmail: "Manny@x.com" })).toMatchObject({
      contactId: "lead",
      via: "related_deal",
    });
    expect(sqlArgs[0]).toEqual(["new", "Manny@x.com"]);
  });

  it("a related link in an unconfigured sub-account stops — no email fallback elsewhere", async () => {
    configured = ["peptide"];
    relatedRows = [{ google_event_id: "e1" }];
    relatedLinks = { e1: { ghlContactId: "x", subAccountId: "agency" } };
    emailHits = { peptide: "p-lead" };
    expect(await resolveDealGhlContact({ dealId: "d", clientEmail: "a@b.com" })).toBeNull();
  });

  it("a related deal whose GHL contact has a DIFFERENT email is not this lead (shared/placeholder address)", async () => {
    relatedRows = [{ google_event_id: "e1" }];
    relatedLinks = { e1: { ghlContactId: "someone-else", subAccountId: "peptide" } };
    contactEmails = { "someone-else": "other@person.com" };
    emailHits = { agency: null, peptide: null };
    expect(await resolveDealGhlContact({ dealId: "d", clientEmail: "na@na.com" })).toBeNull();
  });

  it("email: exactly one sub-account match binds", async () => {
    emailHits = { agency: null, peptide: "p" };
    expect(await resolveDealGhlContact({ dealId: "d", clientEmail: "a@b.com" })).toEqual({ contactId: "p", subAccountId: "peptide", via: "email" });
  });

  it("email: a match in BOTH sub-accounts is ambiguous → nothing", async () => {
    emailHits = { agency: "a", peptide: "p" };
    expect(await resolveDealGhlContact({ dealId: "d", clientEmail: "a@b.com" })).toBeNull();
  });

  it("email: never used while a registered sub-account is unconfigured", async () => {
    configured = ["peptide"];
    emailHits = { peptide: "p" };
    expect(await resolveDealGhlContact({ dealId: "d", clientEmail: "a@b.com" })).toBeNull();
  });

  it("email: fails closed when one sub-account's lookup errors", async () => {
    emailHits = { agency: new Error("503"), peptide: "p" };
    expect(await resolveDealGhlContact({ dealId: "d", clientEmail: "a@b.com" })).toBeNull();
  });

  it("no email → nothing beyond the event", async () => {
    emailHits = { peptide: "p" };
    expect(await resolveDealGhlContact({ dealId: "d", clientEmail: "  " })).toBeNull();
  });
});

describe("funnel opportunity writes", () => {
  const lead = { googleEventId: "e", leadName: "Lead", dealValueCents: 1_100_000 };
  const opp = (over: Partial<Opp>): Opp => ({ id: "o1", status: "open", pipelineId: "p-Website Leads", pipelineStageId: "s-other", name: "Lead", monetaryValue: 0, ...over });
  beforeEach(() => {
    eventLink = { ghlContactId: "c1", subAccountId: "peptide" };
  });

  it("showed didn't close: moves an open lead with the deal value (dollars) and tags it", async () => {
    existingOpp = opp({});
    await bestEffortSyncShowedDidntClose(lead);
    expect(ghlCalls[0]).toEqual(["update", expect.objectContaining({ id: "o1", pipelineStageId: "s-sdc", status: "open", monetaryValue: 11_000 })]);
    expect(ghlCalls).toContainEqual(["addTags", ["showed_didnt_close"]]);
  });

  it("showed didn't close never moves a Won or Active Client opportunity back (and adds no tag)", async () => {
    for (const o of [opp({ status: "won" }), opp({ pipelineStageId: "s-ac" })]) {
      ghlCalls = [];
      existingOpp = o;
      await bestEffortSyncShowedDidntClose(lead);
      expect(ghlCalls).toEqual([]);
    }
  });

  it("paid on an already-Won opportunity keeps the value it was won at (upsell)", async () => {
    existingOpp = opp({ status: "won", monetaryValue: 5_000 });
    await bestEffortSyncActiveClient({ ...lead, dealValueCents: 200_000 });
    expect(ghlCalls[0][1]).toMatchObject({ pipelineStageId: "s-ac", status: "won" });
    expect((ghlCalls[0][1] as { monetaryValue?: number }).monetaryValue).toBeUndefined();
  });

  it("the proposal sync's Active Client heal acts only on a still-open opportunity", async () => {
    const target = { contactId: "c1", subAccountId: "peptide" as const, via: "event" as const };
    for (const status of ["won", "lost", "abandoned"]) {
      ghlCalls = [];
      existingOpp = opp({ status });
      await syncTargetActiveClient(target, { leadName: "Lead", dealValueCents: 1_100_000 });
      expect(ghlCalls).toEqual([]);
    }
    existingOpp = opp({});
    await syncTargetActiveClient(target, { leadName: "Lead", dealValueCents: 1_100_000 });
    expect(ghlCalls[0]).toEqual(["update", expect.objectContaining({ pipelineStageId: "s-ac", status: "won", monetaryValue: 11_000 })]);
  });

  it("paid: Active Client + Won + value, tags swapped", async () => {
    existingOpp = opp({});
    await bestEffortSyncActiveClient(lead);
    expect(ghlCalls[0]).toEqual(["update", expect.objectContaining({ pipelineStageId: "s-ac", status: "won", monetaryValue: 11_000 })]);
    expect(ghlCalls).toContainEqual(["addTags", ["active_client"]]);
    expect(ghlCalls).toContainEqual(["removeTags", ["showed_didnt_close"]]);
  });

  it("no opportunity yet: creates one (paid → Active Client, Won)", async () => {
    await bestEffortSyncActiveClient(lead);
    expect(ghlCalls[0]).toEqual(["create", expect.objectContaining({ pipelineStageId: "s-ac", status: "won", monetaryValue: 11_000, name: "Lead" })]);
  });

  it("signed: Won with value, stage kept; a Won / lost opportunity is left alone", async () => {
    const target = { contactId: "c1", subAccountId: "peptide" as const, via: "event" as const };
    existingOpp = opp({ pipelineStageId: "s-other" });
    await syncTargetWon(target, { leadName: "Lead", dealValueCents: 1_100_000 });
    expect(ghlCalls[0]).toEqual(["update", expect.objectContaining({ pipelineStageId: "s-other", status: "won", monetaryValue: 11_000 })]);
    for (const status of ["won", "lost"]) {
      ghlCalls = [];
      existingOpp = opp({ status, monetaryValue: 5_000 });
      await syncTargetWon(target, { leadName: "Lead", dealValueCents: 1_100_000 });
      expect(ghlCalls).toEqual([]);
    }
  });

  it("a zero deal value leaves GHL's value untouched", async () => {
    existingOpp = opp({});
    await bestEffortSyncActiveClient({ ...lead, dealValueCents: 0 });
    expect(ghlCalls[0][1]).not.toHaveProperty("monetaryValue", expect.anything());
  });
});
