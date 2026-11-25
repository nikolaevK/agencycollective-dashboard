import { describe, expect, it } from "vitest";
import {
  deriveProposal,
  proposalTagPlan,
  proposalFieldValues,
  proposalLinkFieldName,
  proposalLinkIndex,
  ghlMonetaryValue,
  PROPOSAL_TAGS as T,
} from "@/lib/ghlDealRules";

const c = (status: string, signingUrl: string | null = null, sentAt: string | null = null) => ({
  status,
  signingUrl,
  sentAt,
});
const A = "https://docuseal.com/s/aaa";
const B = "https://docuseal.com/s/bbb";

describe("deriveProposal", () => {
  it("is none when nothing was sent", () => {
    expect(deriveProposal([])).toEqual({ state: "none", links: [], sentAt: null });
    expect(deriveProposal([c("pending"), c("pending")]).state).toBe("none");
  });

  it("lists open links in contract order, primary first", () => {
    expect(deriveProposal([c("sent", A), c("sent", B)])).toMatchObject({ state: "sent", links: [A, B] });
  });

  it("is viewed when any open contract was opened, keeping every open link", () => {
    expect(deriveProposal([c("sent", A), c("viewed", B)])).toMatchObject({ state: "viewed", links: [A, B] });
  });

  it("any signed contract wins — the lead picked an option", () => {
    expect(deriveProposal([c("viewed", A), c("signed", B)])).toEqual({ state: "signed", links: [], sentAt: null });
  });

  it("an open option outranks a declined/expired one", () => {
    expect(deriveProposal([c("declined", A), c("sent", B)])).toMatchObject({ state: "sent", links: [B] });
    expect(deriveProposal([c("expired", A), c("viewed", B)]).state).toBe("viewed");
  });

  it("declined outranks expired when nothing is open", () => {
    expect(deriveProposal([c("expired"), c("declined")]).state).toBe("declined");
    expect(deriveProposal([c("expired"), c("pending")]).state).toBe("expired");
  });

  it("reports the latest send among the OPEN contracts", () => {
    const d = deriveProposal([
      c("declined", A, "2026-11-25T10:00:00.000Z"),
      c("sent", B, "2026-11-20T10:00:00.000Z"),
      c("viewed", A, "2026-11-22T10:00:00.000Z"),
    ]);
    expect(d.sentAt).toBe("2026-11-22T10:00:00.000Z");
    expect(deriveProposal([c("sent", A, "not a date")]).sentAt).toBeNull();
  });

  it("drops missing or non-https links", () => {
    expect(deriveProposal([c("sent", null), c("sent", "javascript:alert(1)"), c("sent", " " + A + " ")]).links).toEqual([A]);
  });
});

describe("proposalTagPlan", () => {
  it("sent clears a stale view and old outcomes (a resend restarts the cycle)", () => {
    expect(proposalTagPlan("sent")).toEqual({ add: [T.sent], remove: [T.viewed, T.signed, T.declined, T.expired] });
  });

  it("viewed keeps proposal_sent so follow-ups keep running", () => {
    const p = proposalTagPlan("viewed");
    expect(p.add).toEqual([T.sent, T.viewed]);
    expect(p.remove).not.toContain(T.sent);
  });

  it("signed removes every open tag", () => {
    expect(proposalTagPlan("signed")).toEqual({ add: [T.signed], remove: [T.sent, T.viewed, T.declined, T.expired] });
  });

  it("only an open proposal clears an older proposal_signed (a later deal for the same lead)", () => {
    expect(proposalTagPlan("sent").remove).toContain(T.signed);
    expect(proposalTagPlan("viewed").remove).toContain(T.signed);
    for (const s of ["none", "signed", "declined", "expired"] as const) {
      expect(proposalTagPlan(s).remove).not.toContain(T.signed);
    }
  });

  it("never adds and removes the same tag", () => {
    for (const s of ["none", "sent", "viewed", "signed", "declined", "expired"] as const) {
      const p = proposalTagPlan(s);
      expect(p.add.filter((t) => p.remove.includes(t))).toEqual([]);
    }
  });

  it("none only drops the open tags", () => {
    expect(proposalTagPlan("none")).toEqual({ add: [], remove: [T.sent, T.viewed] });
  });
});

describe("proposalFieldValues", () => {
  const ctx = { dealValueCents: 1_100_000, sentDateYmd: "2026-11-25" };
  const C = "https://docuseal.com/s/ccc";

  it("while open: EVERY open contract's link (however many), status, value and sent date", () => {
    expect(proposalFieldValues({ state: "sent", links: [A], sentAt: null }, ctx)).toEqual({
      fields: { status: "Sent", value: 11_000, sentDate: "2026-11-25" },
      links: [A],
    });
    expect(proposalFieldValues({ state: "viewed", links: [A, B, C], sentAt: null }, ctx)).toEqual({
      fields: { status: "Viewed", value: 11_000, sentDate: "2026-11-25" },
      links: [A, B, C],
    });
  });

  it("after an outcome writes only status + value — the links stay", () => {
    expect(proposalFieldValues({ state: "signed", links: [], sentAt: null }, ctx)).toEqual({ fields: { status: "Signed", value: 11_000 }, links: null });
    expect(proposalFieldValues({ state: "declined", links: [], sentAt: null }, ctx)).toEqual({ fields: { status: "Declined", value: 11_000 }, links: null });
    expect(proposalFieldValues({ state: "expired", links: [], sentAt: null }, ctx)).toEqual({ fields: { status: "Expired", value: 11_000 }, links: null });
  });

  it("clears every link + the status when every sent contract went back to a draft", () => {
    expect(proposalFieldValues({ state: "none", links: [], sentAt: null }, ctx)).toEqual({ fields: { status: "" }, links: [] });
  });

  it("leaves value / sent date alone when unknown", () => {
    const v = proposalFieldValues({ state: "sent", links: [A], sentAt: null }, { dealValueCents: 0, sentDateYmd: null });
    expect(v.fields).toEqual({ status: "Sent" });
  });
});

describe("proposal link fields", () => {
  it("names the n-th link's field: Proposal Link, Proposal Link 2, 3, …", () => {
    expect([1, 2, 3, 12].map(proposalLinkFieldName)).toEqual(["Proposal Link", "Proposal Link 2", "Proposal Link 3", "Proposal Link 12"]);
  });

  it("reads a GHL field name back to its slot (case / space tolerant), round-tripping the names", () => {
    expect(proposalLinkIndex("Proposal Link")).toBe(1);
    expect(proposalLinkIndex(" proposal  LINK 4 ")).toBe(4);
    for (const n of [1, 2, 7, 25]) expect(proposalLinkIndex(proposalLinkFieldName(n))).toBe(n);
  });

  it("ignores other fields", () => {
    for (const name of ["Proposal Links", "Proposal Link 0", "Proposal Link 1", "Proposal Link 02", "Proposal Link Old", "Proposal Closer", "Proposal Status", "My Proposal Link"]) {
      expect(proposalLinkIndex(name)).toBeNull();
    }
  });
});

describe("ghlMonetaryValue", () => {
  it("converts cents to dollars", () => {
    expect(ghlMonetaryValue(1_100_000)).toBe(11_000);
    expect(ghlMonetaryValue(366_667)).toBe(3_666.67);
  });

  it("is null for zero / invalid so GHL's value is left alone", () => {
    expect(ghlMonetaryValue(0)).toBeNull();
    expect(ghlMonetaryValue(-5)).toBeNull();
    expect(ghlMonetaryValue(NaN)).toBeNull();
    expect(ghlMonetaryValue(null)).toBeNull();
  });
});
