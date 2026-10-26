import { describe, expect, it } from "vitest";
import {
  applyScopeOps,
  dealPrepInputHash,
  diffPaperwork,
  diffTemplateFields,
  effectiveDealPrepStatus,
  exemplarScore,
  fieldHint,
  fieldPosKey,
  isGeneratedPaperwork,
  ymdDaysBefore,
  noteTokens,
  paperworkChanged,
  parseScopeOps,
  toScopeFieldView,
  DEAL_PREP_STALL_MS,
  type DsField,
  type DsTemplate,
  type PaperworkSnapshot,
} from "@/lib/dealPrepRules";

// Shaped like the live "Pep - Ads + Creative" base template: retainer / rev
// share / threshold overlays on page 1, a Q4 addendum on page 7.
function base(): DsField[] {
  const f = (uuid: string, type: string, page: number, x: number, y: number, value?: string, readonly = true): DsField => ({
    uuid,
    submitter_uuid: "sub",
    type,
    readonly: value !== undefined ? readonly : undefined,
    default_value: value,
    areas: [{ x, y, w: 0.1, h: 0.02, page, attachment_uuid: "att" }],
  });
  return [
    f("client-name", "text", 0, 0.167, 0.18),
    f("retainer", "text", 1, 0.452, 0.501, "4000 USD"),
    f("rev", "text", 1, 0.438, 0.536, "10"),
    f("threshold", "text", 1, 0.689, 0.535, "0"),
    f("sig", "signature", 6, 0.209, 0.192),
    f("sig-date", "date", 6, 0.175, 0.218),
    f("q4-monthly", "text", 7, 0.685, 0.515, "$4000/Month"),
    f("q4-term", "text", 7, 0.301, 0.547, "3 Months"),
    f("q4-rates", "text", 7, 0.121, 0.662, "Months 1-3 (October–December) or custom time window: $4,000/month retainer. Month 4 onward: reverts to standard $5,500/month"),
    f("q4-initials", "initials", 7, 0.226, 0.873),
    f("q4-date", "date", 7, 0.392, 0.873),
  ];
}
const tpl = (fields: DsField[] = base(), attachments = ["att"]): DsTemplate => ({ fields, attachments });
let n = 0;
const newUuid = () => `new-${++n}`;

describe("dealPrepInputHash", () => {
  const d = {
    dealValue: 650000,
    serviceCategory: '["Ads + Creatives"]',
    industry: "Peptides",
    notes: "6500 package",
    paymentType: "local",
  };
  it("is stable for cosmetic differences and changes with content inputs", () => {
    expect(dealPrepInputHash(d)).toBe(dealPrepInputHash({ ...d, notes: "6500 package\n" }));
    expect(dealPrepInputHash(d)).not.toBe(dealPrepInputHash({ ...d, notes: "12k Q4 package" }));
    expect(dealPrepInputHash(d)).not.toBe(dealPrepInputHash({ ...d, dealValue: 1200000 }));
    expect(dealPrepInputHash(d)).not.toBe(dealPrepInputHash({ ...d, paymentType: "international" }));
  });
});

describe("ymdDaysBefore", () => {
  it("crosses month and year boundaries", () => {
    expect(ymdDaysBefore("2026-10-26", 30)).toBe("2026-09-26");
    expect(ymdDaysBefore("2026-03-01", 1)).toBe("2026-02-28");
    expect(ymdDaysBefore("2026-01-15", 30)).toBe("2025-12-16");
  });
});

describe("effectiveDealPrepStatus", () => {
  it("fails a dispatched run that never reported back", () => {
    const now = Date.parse("2026-10-26T18:00:00Z");
    const fresh = "2026-10-26 17:50:00";
    const old = new Date(now - DEAL_PREP_STALL_MS - 60_000).toISOString().replace("T", " ").slice(0, 19);
    expect(effectiveDealPrepStatus({ status: "dispatched", dispatchedAt: fresh }, now)).toEqual({ status: "dispatched", stalled: false });
    expect(effectiveDealPrepStatus({ status: "dispatched", dispatchedAt: old }, now)).toEqual({ status: "failed", stalled: true });
    expect(effectiveDealPrepStatus({ status: "ready", dispatchedAt: old }, now).status).toBe("ready");
  });
});

describe("field hints + views", () => {
  it("labels agency overlays and protects signer fields", () => {
    const [name, retainer, rev, threshold, sig, , monthly, term, rates] = base();
    expect(fieldHint(retainer)).toBe("money amount");
    expect(fieldHint(rev)).toMatch(/percentage/);
    expect(fieldHint(threshold)).toMatch(/amount/);
    expect(fieldHint(monthly)).toBe("monthly price");
    expect(fieldHint(term)).toBe("term length");
    expect(fieldHint(rates)).toBe("clause text");
    expect(fieldHint(sig)).toMatch(/never touch/);
    expect(toScopeFieldView(tpl(), name)).toMatchObject({ editable: false, removable: false });
    expect(toScopeFieldView(tpl(), retainer)).toMatchObject({ editable: true, removable: true, value: "4000 USD", document: 0, page: 1 });
  });
});

describe("parseScopeOps", () => {
  it.each([
    [{}, "at least one"],
    [{ edits: [{ uuid: "x" }] }, "value"],
    [{ remove: [1] }, "remove"],
    [{ add: [{ type: "signature", page: 0, x: 0, y: 0, w: 0.1, h: 0.1 }] }, "type"],
    [{ add: [{ type: "text", page: 0, x: 0.95, y: 0, w: 0.1, h: 0.1, value: "x" }] }, "inside the page"],
    [{ add: [{ type: "text", page: 0, x: 0, y: 0, w: 0.1, h: 0.1 }] }, "value is required"],
    [{ edits: [{ uuid: "x", value: "y", fontSize: 40 }] }, "fontSize"],
    [{ add: [{ type: "text", document: -1, page: 0, x: 0, y: 0, w: 0.1, h: 0.1, value: "x" }] }, "document"],
  ])("rejects %j", (input, needle) => {
    const r = parseScopeOps(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(needle);
  });
});

describe("applyScopeOps", () => {
  it("turns the Q4 base into a regular 6500 package (edit retainer, drop the addendum)", () => {
    const r = applyScopeOps(
      tpl(),
      "sub",
      { edits: [{ uuid: "retainer", value: "6500 USD" }], remove: ["q4-monthly", "q4-term", "q4-rates", "q4-initials", "q4-date"] },
      newUuid
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.find((f) => f.uuid === "retainer")?.default_value).toBe("6500 USD");
    expect(r.value.some((f) => f.areas?.[0].page === 7)).toBe(false);
    expect(r.value).toHaveLength(6);
  });

  it("adds a read-only clause box and signer initials", () => {
    const r = applyScopeOps(
      tpl(),
      "sub",
      {
        add: [
          { type: "text", page: 7, x: 0.12, y: 0.78, w: 0.76, h: 0.06, value: "Retainer credit above $4M." },
          { type: "initials", page: 7, x: 0.2, y: 0.9, w: 0.1, h: 0.03 },
        ],
      },
      newUuid
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [clause, initials] = r.value.slice(-2);
    expect(clause).toMatchObject({ type: "text", readonly: true, default_value: "Retainer credit above $4M.", submitter_uuid: "sub" });
    expect(clause.areas?.[0]).toMatchObject({ page: 7, attachment_uuid: "att" });
    expect(initials).toMatchObject({ type: "initials", readonly: false, required: true });
  });

  it("places an added field on the requested document of a multi-document template", () => {
    const r = applyScopeOps(tpl(base(), ["att", "att2"]), "sub", { add: [{ type: "text", document: 1, page: 0, x: 0.1, y: 0.1, w: 0.5, h: 0.05, value: "Addendum" }] }, newUuid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.at(-1)?.areas?.[0]).toMatchObject({ page: 0, attachment_uuid: "att2" });
  });

  it.each([
    [{ edits: [{ uuid: "client-name", value: "Acme" }] }, "filled by the client"],
    [{ remove: ["sig"] }, "protected"],
    [{ edits: [{ uuid: "nope", value: "x" }] }, "No field"],
    [{ edits: [{ uuid: "rev", value: "8" }], remove: ["rev"] }, "both edited and removed"],
    [{ add: [{ type: "text" as const, document: 1, page: 0, x: 0, y: 0, w: 0.1, h: 0.1, value: "x" }] }, "doesn't exist"],
  ])("refuses %j", (ops, needle) => {
    const r = applyScopeOps(tpl(), "sub", ops, newUuid);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(needle);
  });
});

describe("diffTemplateFields", () => {
  it("reports what an admin edited, removed and added on the clone (position-matched)", () => {
    const clone = base().map((f) => ({ ...f, uuid: `c-${f.uuid}` })); // a clone gets new uuids
    clone.find((f) => f.uuid === "c-retainer")!.default_value = "6500 USD";
    const trimmed = clone.filter((f) => f.areas?.[0].page !== 7);
    trimmed.push({ uuid: "c-new", type: "text", readonly: true, default_value: "Custom clause", areas: [{ x: 0.1, y: 0.9, w: 0.5, h: 0.05, page: 1 }] });
    const d = diffTemplateFields(tpl(), tpl(trimmed));
    expect(d.edited).toEqual([expect.objectContaining({ page: 1, from: "4000 USD", to: "6500 USD" })]);
    expect(d.removed).toHaveLength(5);
    expect(d.added).toEqual([expect.objectContaining({ type: "text", to: "Custom clause" })]);
  });

  it("matches fields by document index, not by the clone's renewed attachment uuids", () => {
    const second = (att: string): DsField => ({ uuid: `x-${att}`, type: "text", readonly: true, default_value: "B", areas: [{ x: 0.1, y: 0.2, w: 0.1, h: 0.02, page: 1, attachment_uuid: att }] });
    const baseT = tpl([...base(), second("att2")], ["att", "att2"]);
    const cloneT = tpl(
      [...base().map((f) => ({ ...f, areas: f.areas?.map((a) => ({ ...a, attachment_uuid: "new1" })) })), second("new2")],
      ["new1", "new2"]
    );
    expect(fieldPosKey(cloneT, cloneT.fields.at(-1)!)).toBe("d1:1:0.10:0.20");
    // Same page/x/y as the retainer field on document 0 — must not collide.
    expect(fieldPosKey(baseT, baseT.fields[1])).toBe("1:0.45:0.50");
    expect(diffTemplateFields(baseT, cloneT)).toEqual({ edited: [], removed: [], added: [] });
  });
});

describe("diffPaperwork", () => {
  const snap = (over: Partial<PaperworkSnapshot> = {}): PaperworkSnapshot => ({
    invoices: [
      {
        kind: "primary",
        id: "inv1",
        number: "INV-1",
        status: "draft",
        invoiceDate: "2026-10-26",
        dueDate: "2026-10-31",
        terms: "Due on receipt",
        paymentTerms: "",
        notes: "",
        discount: null,
        items: [
          { name: "All-In-One Marketing for Startups", quantity: 1, unitPriceCents: 650000 },
          { name: "Agency Ad Account", quantity: 1, unitPriceCents: 50000 },
        ],
        totalCents: 700000,
      },
    ],
    contracts: [
      {
        kind: "primary",
        id: "c1",
        status: "pending",
        templateId: "t1",
        templateName: "Pep - Ads + Creative",
        fields: { "1:0.45:0.50": { type: "text", value: "6500 USD" }, "1:0.44:0.54": { type: "text", value: "10" } },
        changesFromBase: null,
        documentNames: [],
      },
    ],
    ...over,
  });

  it("is empty when nothing changed", () => {
    expect(diffPaperwork(snap(), snap())).toEqual([]);
  });

  it("skips field lessons for a contract whose template couldn't be read", () => {
    const sent = snap();
    sent.contracts[0] = { ...sent.contracts[0], fields: {}, unreadable: true };
    expect(diffPaperwork(snap(), sent)).toEqual([]);
  });

  it("reports a prepared invoice that wasn't sent", () => {
    expect(diffPaperwork(snap(), snap({ invoices: [] }))).toEqual([
      "Invoice INV-1 prepared by the agent was dropped (deleted or not sent): All-In-One Marketing for Startups $6,500 + Agency Ad Account $500",
    ]);
  });

  it("describes the reviewer's corrections", () => {
    const sent = snap();
    sent.invoices[0] = { ...sent.invoices[0], items: [sent.invoices[0].items[0]], dueDate: "2026-11-02" };
    sent.contracts[0] = { ...sent.contracts[0], fields: { ...sent.contracts[0].fields, "1:0.44:0.54": { type: "text", value: "8" } } };
    const out = diffPaperwork(snap(), sent);
    expect(out).toEqual([
      "Invoice primary lines changed: All-In-One Marketing for Startups $6,500 + Agency Ad Account $500 → All-In-One Marketing for Startups $6,500",
      "Invoice primary due date changed: 2026-10-31 → 2026-11-02",
      'Contract primary field @1:0.44:0.54 changed: "10" → "8"',
    ]);
  });
});

describe("paperworkChanged (a person's edits since the agent's submit)", () => {
  const snap = (value: string, unreadable = false): PaperworkSnapshot => ({
    invoices: [],
    contracts: [
      { kind: "primary", id: "c1", status: "pending", templateId: "t1", templateName: "T", fields: { "1:0.45:0.50": { type: "text", value } }, changesFromBase: null, documentNames: [], unreadable },
    ],
  });
  it("is false when the paperwork is what the agent left", () => {
    expect(paperworkChanged(snap("6500 USD"), snap("6500 USD"))).toBe(false);
  });
  it("sees a scope edit made in the DocuSeal builder", () => {
    expect(paperworkChanged(snap("6500 USD"), snap("7000 USD"))).toBe(true);
  });
  it("treats an unreadable template as changed", () => {
    expect(paperworkChanged(snap("6500 USD"), snap("", true))).toBe(true);
    expect(paperworkChanged(snap("", true), snap("6500 USD"))).toBe(true);
  });
});

describe("isGeneratedPaperwork (never-prepared deals)", () => {
  const rec = (over: Partial<{ kind: "primary" | "additional"; createdAt: string; updatedAt: string; customized: boolean }> = {}) => ({
    kind: "primary" as const,
    createdAt: "2026-10-20 10:00:00",
    updatedAt: "2026-10-20 10:00:00",
    ...over,
  });
  it("accepts paperwork as deal creation generated it (incl. writes within the grace window)", () => {
    expect(isGeneratedPaperwork([rec(), rec({ updatedAt: "2026-10-20 10:01:30" })])).toBe(true);
    expect(isGeneratedPaperwork([])).toBe(true);
  });
  it.each([
    ["edited later", [rec({ updatedAt: "2026-10-21 09:00:00" })]],
    ["a per-deal contract copy", [rec({ customized: true })]],
    ["an extra invoice or contract", [rec(), rec({ kind: "additional" })]],
    ["an unreadable timestamp", [rec({ updatedAt: "garbage" })]],
  ])("rejects %s", (_label, records) => {
    expect(isGeneratedPaperwork(records)).toBe(false);
  });
});

describe("exemplar similarity", () => {
  it("normalizes package amounts and percentages", () => {
    const t = noteTokens("Send the Q4 12k package and 6,500 package, both with 10% rev share. Include agency account.");
    expect(t.get("$12000")).toBe(3);
    expect(t.get("$6500")).toBe(3);
    expect(t.get("10%")).toBe(3);
    expect(t.get("q4")).toBe(2);
    expect(t.get("agency")).toBe(2);
  });

  it("ranks the deal with the same package mix above an unrelated one", () => {
    const target = { notes: "Q4 12k package + 6500 package, 10% rev share, agency account", serviceCategory: '["Ads + Creatives + Email"]', industry: "Peptides", dealValue: 1200000 };
    const similar = { notes: "Please send 12k Q4 package and 6500 for the same, 10% rev share, include 500/mo agency account", serviceCategory: '["Ads + Creatives + Email"]', industry: "Peptides", dealValue: 1200000 };
    const other = { notes: "40k website build and launch for a telehealth clinic", serviceCategory: '["Done-For-You Launch"]', industry: "Health", dealValue: 4000000 };
    expect(exemplarScore(target, similar)).toBeGreaterThan(exemplarScore(target, other) + 0.3);
  });
});
