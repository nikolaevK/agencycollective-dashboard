import { describe, it, expect } from "vitest";
import {
  buildMonthlyRebillProgress,
  monthlyRebillBucket,
  monthlyHeadline,
  monthlyRetentionOf,
  MONTHLY_REBILL_BUCKETS,
} from "@/lib/teamRebill";

const clients = [
  // collected: qualifying payment recorded IN the tracker month
  { rebill: { status: "upcoming" as const, lastPaidMonth: "2026-07" }, mrrCents: 100_00 },
  // sent this cycle
  { rebill: { status: "invoice_sent" as const, lastPaidMonth: null }, mrrCents: 200_00 },
  // due
  { rebill: { status: "due" as const, lastPaidMonth: null }, mrrCents: 300_00 },
  // overdue
  { rebill: { status: "overdue" as const, lastPaidMonth: null }, mrrCents: 400_00 },
  // scheduled (upcoming, unpaid)
  { rebill: { status: "upcoming" as const, lastPaidMonth: null }, mrrCents: 500_00 },
  // untracked: pepads (null schedule) and paused
  { rebill: null, mrrCents: 600_00 },
  { rebill: { status: "paused" as const, lastPaidMonth: "2026-07" }, mrrCents: 700_00 },
];

describe("buildMonthlyRebillProgress", () => {
  const progress = buildMonthlyRebillProgress(clients, "2026-07");

  it("puts every client in exactly one bucket (counts partition)", () => {
    const total = MONTHLY_REBILL_BUCKETS.reduce(
      (s, b) => s + progress.buckets[b].count,
      0
    );
    expect(total).toBe(clients.length);
  });

  it("bucket MRR sums exactly to total MRR managed", () => {
    const totalMrr = MONTHLY_REBILL_BUCKETS.reduce(
      (s, b) => s + progress.buckets[b].mrrCents,
      0
    );
    expect(totalMrr).toBe(clients.reduce((s, c) => s + c.mrrCents, 0));
  });

  it("collected is month-scoped: a June payment does NOT count for July", () => {
    expect(
      monthlyRebillBucket({ status: "upcoming", lastPaidMonth: "2026-06" }, "2026-07")
    ).toBe("scheduled");
    expect(
      monthlyRebillBucket({ status: "upcoming", lastPaidMonth: "2026-07" }, "2026-07")
    ).toBe("collected");
  });

  it("collected wins over the cycle status when the money is in", () => {
    expect(
      monthlyRebillBucket({ status: "overdue", lastPaidMonth: "2026-07" }, "2026-07")
    ).toBe("collected");
  });

  it("paused/unscheduled/pepads land in untracked even with a payment", () => {
    expect(progress.buckets.untracked.count).toBe(2);
  });
});

describe("monthlyHeadline", () => {
  it("uses the whole-book Payout-DB aggregate when present", () => {
    const p = buildMonthlyRebillProgress(clients, "2026-07", 9_999_00);
    expect(monthlyHeadline(p)).toEqual({ cents: 9_999_00, wholeBook: true });
  });

  it("falls back to the collected-bucket MRR sum", () => {
    const p = buildMonthlyRebillProgress(clients, "2026-07");
    expect(monthlyHeadline(p)).toEqual({ cents: 100_00, wholeBook: false });
  });
});

describe("monthlyRetentionOf", () => {
  it("retained = collected count, base = ALL buckets including untracked", () => {
    const p = buildMonthlyRebillProgress(clients, "2026-07");
    const r = monthlyRetentionOf(p);
    expect(r.base).toBe(clients.length);
    expect(r.retained).toBe(1);
    expect(r.month).toBe("2026-07");
  });
});
