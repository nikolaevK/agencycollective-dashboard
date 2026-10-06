import { describe, it, expect } from "vitest";
import {
  canFollowUp,
  daysSince,
  parseFollowUpInput,
  FOLLOW_UP_MESSAGE_MAX,
} from "@/lib/invoiceFollowUpRules";
import {
  computeRebillSchedule,
  parseBillingDateInput,
  billingDateInputValue,
  type ClientBilling,
} from "@/lib/clientBilling";
import {
  allocateAutoPaid,
  pickActiveSentInvoice,
  parseCcEmails,
  rebillPaymentUnits,
} from "@/lib/clientRebillInvoices";
import { splitOpenInvoices } from "@/components/users/openInvoices";

// Follow-ups chase payment on a sent invoice without touching it, and a
// client/account can be awaiting payment on more than one cycle at once —
// pin both contracts.

describe("parseFollowUpInput", () => {
  it("defaults an email reminder to the invoice's original recipient + attaches the PDF", () => {
    const r = parseFollowUpInput({ channel: "email" }, "billing@client.com");
    expect(r).toEqual({
      ok: true,
      value: {
        channel: "email",
        message: null,
        recipientEmail: "billing@client.com",
        ccEmails: [],
        attachPdf: true,
        styleProfileId: undefined,
      },
    });
  });

  it("normalizes CCs, drops the primary, and keeps an explicit style choice", () => {
    const r = parseFollowUpInput(
      {
        channel: "email",
        recipientEmail: "Owner@Client.com",
        cc: ["owner@client.com", "CFO@client.com", "cfo@client.com "],
        message: "  Friendly nudge  ",
        attachPdf: false,
        styleProfileId: null,
      },
      null
    );
    expect(r.ok && r.value).toMatchObject({
      recipientEmail: "Owner@Client.com",
      ccEmails: ["cfo@client.com"],
      message: "Friendly nudge",
      attachPdf: false,
      styleProfileId: null,
    });
  });

  it("rejects bad addresses instead of silently dropping them", () => {
    expect(parseFollowUpInput({ channel: "email" }, null).ok).toBe(false);
    expect(parseFollowUpInput({ channel: "email", recipientEmail: "nope" }, null).ok).toBe(false);
    expect(
      parseFollowUpInput({ channel: "email", cc: ["ok@x.com", "not-an-email"] }, "a@b.com").ok
    ).toBe(false);
    expect(parseFollowUpInput({ channel: "email", cc: "a@b.com" }, "a@b.com").ok).toBe(false);
  });

  it("requires a note for logged (non-email) touches and caps its length", () => {
    expect(parseFollowUpInput({ channel: "call" }, "a@b.com").ok).toBe(false);
    expect(parseFollowUpInput({ channel: "call", message: "   " }, "a@b.com").ok).toBe(false);
    expect(
      parseFollowUpInput({ channel: "note", message: "x".repeat(FOLLOW_UP_MESSAGE_MAX + 1) }, null).ok
    ).toBe(false);
    const r = parseFollowUpInput({ channel: "message", message: "Texted Sam" }, "a@b.com");
    expect(r.ok && r.value).toMatchObject({
      channel: "message",
      message: "Texted Sam",
      recipientEmail: null,
      attachPdf: false,
    });
  });

  it("rejects unknown channels and non-object bodies", () => {
    expect(parseFollowUpInput({ channel: "fax" }, "a@b.com").ok).toBe(false);
    expect(parseFollowUpInput(null, "a@b.com").ok).toBe(false);
    expect(parseFollowUpInput([], "a@b.com").ok).toBe(false);
  });
});

describe("canFollowUp / daysSince", () => {
  it("only invoices still owed can be chased", () => {
    expect(canFollowUp("sent")).toBe(true);
    expect(canFollowUp("unpaid")).toBe(true);
    expect(canFollowUp("paid")).toBe(false);
    expect(canFollowUp("superseded")).toBe(false);
  });

  it("counts whole days, never negative", () => {
    const now = new Date("2026-10-06T12:00:00Z");
    expect(daysSince("2026-09-26T12:00:00Z", now)).toBe(10);
    expect(daysSince("2026-10-07T12:00:00Z", now)).toBe(0);
    expect(daysSince(null, now)).toBeNull();
    expect(daysSince("garbage", now)).toBeNull();
  });
});

function billing(overrides: Partial<ClientBilling> = {}): ClientBilling {
  return {
    userId: "u1",
    cadence: "monthly",
    billingDay: 15,
    paused: false,
    pauseReason: null,
    extendUntil: null,
    lastRebilledOverride: null,
    mrrMonthOverride: null,
    leadDays: 5,
    settingsNotes: null,
    createdAt: "2025-01-01 00:00:00",
    updatedAt: "2025-01-01 00:00:00",
    ...overrides,
  };
}

describe("several awaiting invoices", () => {
  // Payout in September → next bill Oct 15; today Oct 12 (within the lead).
  const base = {
    anchorDate: "2025-01-15",
    billing: billing(),
    payoutMonths: [{ year: 2026, month: 9 }],
    today: new Date("2026-10-12T00:00:00Z"),
  };

  it("lights invoice_sent when ANY awaiting invoice is on the current cycle", () => {
    const s = computeRebillSchedule({
      ...base,
      // A newer backfill for an earlier cycle must not hide the current one.
      sentCycleAnchors: ["2026-09-15", "2026-10-15"],
    });
    expect(s.nextRebillAt).toBe("2026-10-15");
    expect(s.status).toBe("invoice_sent");
  });

  it("stays due when no awaiting invoice is on the current cycle", () => {
    const s = computeRebillSchedule({ ...base, sentCycleAnchors: ["2026-09-15"] });
    expect(s.status).toBe("due");
  });

  it("pickActiveSentInvoice prefers the current cycle over the newest send", () => {
    const sent = [
      { id: "backfill", cycleAnchor: "2026-09-15" }, // newest by send time
      { id: "current", cycleAnchor: "2026-10-15" },
    ];
    expect(pickActiveSentInvoice(sent, "2026-10-15")?.id).toBe("current");
    expect(pickActiveSentInvoice(sent, "2026-11-15")?.id).toBe("backfill");
    expect(pickActiveSentInvoice(sent, null)?.id).toBe("backfill");
    expect(pickActiveSentInvoice([], "2026-10-15")).toBeNull();
  });
});

describe("parseBillingDateInput", () => {
  it("accepts real dates and clears on null/empty", () => {
    expect(parseBillingDateInput(undefined)).toEqual({ ok: true, value: undefined });
    expect(parseBillingDateInput(null)).toEqual({ ok: true, value: null });
    expect(parseBillingDateInput("  ")).toEqual({ ok: true, value: null });
    expect(parseBillingDateInput("2026-10-15")).toEqual({ ok: true, value: "2026-10-15" });
  });

  it("rejects strings the engine would mis-read", () => {
    expect(parseBillingDateInput("June 5").ok).toBe(false); // → 2001-06-05
    expect(parseBillingDateInput("2026-02-30").ok).toBe(false); // → Mar 2
    expect(parseBillingDateInput(20261015).ok).toBe(false);
  });
});

describe("parseCcEmails", () => {
  it("reads stored JSON defensively", () => {
    expect(parseCcEmails('["a@b.com","c@d.com"]')).toEqual(["a@b.com", "c@d.com"]);
    expect(parseCcEmails(null)).toEqual([]);
    expect(parseCcEmails("not json")).toEqual([]);
    expect(parseCcEmails('{"a":1}')).toEqual([]);
    expect(parseCcEmails('["a@b.com", 3]')).toEqual(["a@b.com"]);
  });
});

describe("allocateAutoPaid — one payment settles one open invoice", () => {
  const sept = { id: "sept", cycleAnchor: "2026-09-15" };
  const oct = { id: "oct", cycleAnchor: "2026-10-15" };

  it("a single October payment settles October, not September too", () => {
    const a = allocateAutoPaid([sept, oct], [{ year: 2026, month: 10 }]);
    expect(a.get("oct")).toEqual({ year: 2026, month: 10 });
    expect(a.has("sept")).toBe(false);
  });

  it("leftover payments go to the oldest open cycle", () => {
    const a = allocateAutoPaid([oct, sept], [
      { year: 2026, month: 10 },
      { year: 2026, month: 11 },
    ]);
    expect(a.get("oct")).toEqual({ year: 2026, month: 10 });
    expect(a.get("sept")).toEqual({ year: 2026, month: 11 });
  });

  it("a payment before the cycle settles nothing; locked rows consume nothing", () => {
    expect(allocateAutoPaid([oct], [{ year: 2026, month: 9 }]).size).toBe(0);
    const a = allocateAutoPaid(
      [{ ...oct, reconcileLocked: true }, sept],
      [{ year: 2026, month: 10 }]
    );
    expect(a.has("oct")).toBe(false);
    expect(a.get("sept")).toEqual({ year: 2026, month: 10 });
  });

  it("matches decideAutoPaid's outcome for a single open invoice", () => {
    expect(allocateAutoPaid([sept], [{ year: 2026, month: 12 }]).get("sept")).toEqual({
      year: 2026,
      month: 12,
    });
  });

  it("a payment already spent on a paid invoice can't settle another on the next pass", () => {
    const octPayout = [{ year: 2026, month: 10 }];
    // Pass 1: both open → October's payment settles October only.
    expect(allocateAutoPaid([sept, oct], octPayout).has("sept")).toBe(false);
    // Pass 2: October is now paid (out of the open list) and consumed its
    // payout month — September must stay open.
    expect(allocateAutoPaid([sept], octPayout, [{ year: 2026, month: 10 }]).size).toBe(0);
    // A second October payment (catch-up) is still free for September.
    const two = allocateAutoPaid([sept], [...octPayout, ...octPayout], [{ year: 2026, month: 10 }]);
    expect(two.get("sept")).toEqual({ year: 2026, month: 10 });
  });

  it("consumed months that aren't in the pool are ignored", () => {
    const a = allocateAutoPaid([oct], [{ year: 2026, month: 10 }], [{ year: 2026, month: 8 }]);
    expect(a.get("oct")).toEqual({ year: 2026, month: 10 });
  });
});

describe("rebillPaymentUnits — one entry per recurring-size payment", () => {
  const m = (month: number, amountDue: number, rows = 1) => ({ year: 2026, month, amountDue, rows });

  it("one entry per month at the recurring amount; one-off amounts qualify nothing", () => {
    expect(rebillPaymentUnits([m(8, 1000), m(9, 450), m(10, 1000)])).toEqual([
      { year: 2026, month: 8 },
      { year: 2026, month: 10 },
    ]);
  });

  it("a catch-up month (two payments) counts for two cycles — even as the latest month", () => {
    expect(rebillPaymentUnits([m(8, 1000), m(9, 1000), m(10, 2000, 2)])).toEqual([
      { year: 2026, month: 8 },
      { year: 2026, month: 9 },
      { year: 2026, month: 10 },
      { year: 2026, month: 10 },
    ]);
    // …and once a normal month follows it.
    expect(rebillPaymentUnits([m(9, 1000), m(10, 2000, 2), m(11, 1000)])).toHaveLength(4);
  });

  it("a single row at a doubled amount as the latest month reads as a price change", () => {
    expect(rebillPaymentUnits([m(9, 1000), m(10, 2000, 1)])).toEqual([{ year: 2026, month: 10 }]);
  });

  it("split payments summing to the recurring amount stay one cycle", () => {
    expect(rebillPaymentUnits([m(9, 1000, 2), m(10, 1000, 2)])).toHaveLength(2);
  });

  it("keeps the legacy equality rule for a zero baseline", () => {
    expect(rebillPaymentUnits([m(9, 0), m(10, 0)])).toHaveLength(2);
    expect(rebillPaymentUnits([])).toEqual([]);
  });
});

describe("splitOpenInvoices — what a send replaces", () => {
  const inv = (id: string, cycleAnchor: string) => ({
    id,
    invoiceNumber: id,
    cycleAnchor,
    sentAt: "2026-10-01T12:00:00.000Z",
  });

  it("same cycle → replaced; same month, other day → pre-selected; other months → kept", () => {
    const r = splitOpenInvoices(
      [inv("a", "2026-10-05"), inv("b", "2026-10-01"), inv("c", "2026-09-05")],
      "2026-10-05"
    );
    expect(r.replaced.map((i) => i.id)).toEqual(["a"]);
    expect(r.others.map((i) => i.id)).toEqual(["b", "c"]);
    expect(r.sameMonthIds).toEqual(["b"]);
  });
});

describe("billing date inputs from older callers", () => {
  it("accepts ISO timestamps by their date part (what the engine reads)", () => {
    expect(parseBillingDateInput("2026-10-15T00:00:00.000Z")).toEqual({ ok: true, value: "2026-10-15" });
    expect(parseBillingDateInput("2026-10-15 08:30:00")).toEqual({ ok: true, value: "2026-10-15" });
    expect(parseBillingDateInput("2026-02-30T00:00:00Z").ok).toBe(false);
    expect(parseBillingDateInput("2026-10-15junk").ok).toBe(false);
  });

  it("blanks unreadable legacy values for date inputs", () => {
    expect(billingDateInputValue("2026-10-15T00:00:00Z")).toBe("2026-10-15");
    expect(billingDateInputValue("June 5")).toBe("");
    expect(billingDateInputValue(null)).toBe("");
  });
});
