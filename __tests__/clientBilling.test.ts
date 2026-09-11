import { describe, it, expect } from "vitest";
import {
  computeRebillSchedule,
  cycleOptionsAround,
  type ClientBilling,
} from "@/lib/clientBilling";

// Pin the documented invariants of the pure re-bill engine (CLAUDE.md
// "Re-bill / Ad-Account schedule gotchas") so refactors get a TS/CI nudge.

function billing(overrides: Partial<ClientBilling> = {}): ClientBilling {
  return {
    userId: "u1",
    cadence: "monthly",
    billingDay: null,
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

const day = (s: string) => new Date(`${s}T00:00:00Z`);

describe("computeRebillSchedule — cycle math", () => {
  it("advances one month after the latest payout month", () => {
    const s = computeRebillSchedule({
      anchorDate: "2026-01-15",
      billing: billing(),
      payoutMonths: [{ year: 2026, month: 5 }, { year: 2026, month: 6 }],
      today: day("2026-06-20"),
    });
    expect(s.nextRebillAt).toBe("2026-07-15");
    expect(s.status).toBe("upcoming");
  });

  it("EVERY payout month advances the schedule (unfiltered by design) while paid stays driven by paidMonths", () => {
    const s = computeRebillSchedule({
      anchorDate: "2026-01-15",
      billing: billing(),
      // a one-off payment landed in June — schedule moves to July...
      payoutMonths: [{ year: 2026, month: 6 }],
      // ...but no QUALIFYING payment, so the paid flag must stay false
      paidMonths: [],
      today: day("2026-06-20"),
    });
    expect(s.nextRebillAt).toBe("2026-07-15");
    expect(s.paid).toBe(false);
  });

  it("rolls December into January", () => {
    const s = computeRebillSchedule({
      anchorDate: "2026-01-15",
      billing: billing(),
      payoutMonths: [{ year: 2026, month: 12 }],
      today: day("2026-12-20"),
    });
    expect(s.nextRebillAt).toBe("2027-01-15");
  });

  it("clamps a day-31 cycle into shorter months", () => {
    const s = computeRebillSchedule({
      anchorDate: "2026-01-31",
      billing: billing(),
      payoutMonths: [{ year: 2026, month: 1 }],
      today: day("2026-02-01"),
    });
    // Feb 2026 has 28 days
    expect(s.nextRebillAt).toBe("2026-02-28");
  });
});

describe("computeRebillSchedule — last_billed_override", () => {
  it("is authoritative even when earlier than the payouts", () => {
    const s = computeRebillSchedule({
      anchorDate: "2026-01-15",
      billing: billing({ lastRebilledOverride: "2026-04-10" }),
      payoutMonths: [{ year: 2026, month: 6 }],
      today: day("2026-06-20"),
    });
    expect(s.lastRebilledAt).toBe("2026-04-10");
    expect(s.nextRebillAt).toBe("2026-05-10");
  });

  it("its day-of-month becomes the billing day when billing_day is null", () => {
    const s = computeRebillSchedule({
      anchorDate: "2026-01-15",
      billing: billing({ lastRebilledOverride: "2026-06-03" }),
      payoutMonths: [],
      today: day("2026-06-10"),
    });
    expect(s.billingDay).toBe(3);
    expect(s.nextRebillAt).toBe("2026-07-03");
  });

  it("an explicit billing_day beats the override's day", () => {
    const s = computeRebillSchedule({
      anchorDate: "2026-01-15",
      billing: billing({ lastRebilledOverride: "2026-06-03", billingDay: 20 }),
      payoutMonths: [],
      today: day("2026-06-10"),
    });
    expect(s.billingDay).toBe(20);
    expect(s.nextRebillAt).toBe("2026-06-20");
  });
});

describe("computeRebillSchedule — statuses", () => {
  it("due inside the lead window, overdue past it", () => {
    const base = {
      anchorDate: "2026-01-15",
      billing: billing(),
      payoutMonths: [{ year: 2026, month: 5 }],
    };
    expect(computeRebillSchedule({ ...base, today: day("2026-06-12") }).status).toBe("due");
    expect(computeRebillSchedule({ ...base, today: day("2026-06-16") }).status).toBe("overdue");
  });

  it("paused wins regardless", () => {
    const s = computeRebillSchedule({
      anchorDate: "2026-01-15",
      billing: billing({ paused: true }),
      payoutMonths: [{ year: 2026, month: 5 }],
      today: day("2026-06-20"),
    });
    expect(s.status).toBe("paused");
  });

  it("no anchor → unscheduled", () => {
    const s = computeRebillSchedule({
      anchorDate: null,
      billing: billing(),
      payoutMonths: [],
      today: day("2026-06-20"),
    });
    expect(s.status).toBe("unscheduled");
  });

  it("extended suppresses due only while extend_until is outside the lead window, then falls through to due", () => {
    const base = {
      anchorDate: "2026-01-15",
      billing: billing({ extendUntil: "2026-07-01" }),
      payoutMonths: [{ year: 2026, month: 5 }],
    };
    // Deferred bill (Jul 1) still outside the 5-day lead window on Jun 20
    expect(computeRebillSchedule({ ...base, today: day("2026-06-20") }).status).toBe("extended");
    // Within lead days of the deferred bill → re-enters due
    expect(computeRebillSchedule({ ...base, today: day("2026-06-28") }).status).toBe("due");
  });
});

describe("computeRebillSchedule — invoice_sent binding", () => {
  const base = {
    anchorDate: "2026-01-15",
    billing: billing(),
    payoutMonths: [{ year: 2026, month: 5 }],
    today: day("2026-06-12"), // due window for 2026-06-15
  };

  it("promotes to invoice_sent only when the invoice's cycleAnchor matches the recomputed nextRebillAt", () => {
    const s = computeRebillSchedule({
      ...base,
      activeSentInvoice: { cycleAnchor: "2026-06-15" },
    });
    expect(s.status).toBe("invoice_sent");
  });

  it("ignores an invoice anchored to any other cycle", () => {
    const s = computeRebillSchedule({
      ...base,
      activeSentInvoice: { cycleAnchor: "2026-05-15" },
    });
    expect(s.status).toBe("due");
  });
});

describe("computeRebillSchedule — paid flag", () => {
  it("a qualifying payment covering the current cycle sets paid without changing the base status", () => {
    const s = computeRebillSchedule({
      anchorDate: "2026-01-15",
      billing: billing(),
      payoutMonths: [{ year: 2026, month: 6 }],
      paidMonths: [{ year: 2026, month: 6 }],
      today: day("2026-06-20"),
    });
    expect(s.paid).toBe(true);
    expect(s.status).toBe("upcoming");
    expect(s.lastPaidMonth).toBe("2026-06");
  });
});

describe("cycleOptionsAround — manual cycle pickers", () => {
  it("shifts the reference cycle by whole months keeping the day", () => {
    const opts = cycleOptionsAround("2026-10-15", [-1, 0, 1]);
    expect(opts.map((o) => o.date)).toEqual(["2026-09-15", "2026-10-15", "2026-11-15"]);
  });

  it("clamps to the month length instead of overflowing (Jan 31 → Feb 28)", () => {
    const opts = cycleOptionsAround("2026-01-31", [1, 2]);
    expect(opts.map((o) => o.date)).toEqual(["2026-02-28", "2026-03-31"]);
  });

  it("rolls across year boundaries in both directions", () => {
    const opts = cycleOptionsAround("2026-01-10", [-1, 12]);
    expect(opts.map((o) => o.date)).toEqual(["2025-12-10", "2027-01-10"]);
  });
});

describe("computeRebillSchedule — manually settled cycles", () => {
  it("a paid invoice's cycle month merged into paidMonths marks the cycle paid without a payout", () => {
    const s = computeRebillSchedule({
      anchorDate: "2026-01-15",
      billing: billing(),
      // Payout DB only knows about September...
      payoutMonths: [{ year: 2026, month: 9 }],
      // ...but the admin marked the October-cycle invoice paid by hand.
      paidMonths: [{ year: 2026, month: 10 }],
      today: day("2026-10-20"),
    });
    expect(s.paid).toBe(true);
    expect(s.lastPaidMonth).toBe("2026-10");
  });

  it("the directory merges paid cycles into payoutMonths too, so a hand-settled cycle advances the bill (no Paid + Overdue)", () => {
    const paidCycles = [{ year: 2026, month: 10 }];
    const s = computeRebillSchedule({
      anchorDate: "2026-01-15",
      billing: billing(),
      payoutMonths: [{ year: 2026, month: 9 }, ...paidCycles],
      paidMonths: paidCycles,
      today: day("2026-10-20"),
    });
    expect(s.paid).toBe(true);
    expect(s.nextRebillAt).toBe("2026-11-15");
    expect(s.status).toBe("upcoming");
  });
});
