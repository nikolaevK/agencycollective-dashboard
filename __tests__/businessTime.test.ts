import { describe, it, expect } from "vitest";
import { businessTodayYmd, businessToday } from "@/lib/businessTime";

// Default zone is America/Los_Angeles (BILLING_TIME_ZONE unset in tests).
// The whole class of "status flips a day early every evening PT" bugs funnels
// through these two functions — pin the UTC-rollover boundary behavior.
describe("businessTodayYmd", () => {
  it("returns the PT calendar date for an evening-PT instant that has already rolled to the next UTC day", () => {
    // 2026-07-16T03:00:00Z = 2026-07-15 20:00 PDT
    expect(businessTodayYmd(new Date("2026-07-16T03:00:00Z"))).toBe("2026-07-15");
  });

  it("returns the same date when UTC and PT agree (midday)", () => {
    // 2026-07-15T19:00:00Z = 2026-07-15 12:00 PDT
    expect(businessTodayYmd(new Date("2026-07-15T19:00:00Z"))).toBe("2026-07-15");
  });

  it("handles the PST (winter) offset too", () => {
    // 2026-01-16T05:00:00Z = 2026-01-15 21:00 PST
    expect(businessTodayYmd(new Date("2026-01-16T05:00:00Z"))).toBe("2026-01-15");
  });

  it("rolls to the next PT day only after PT midnight", () => {
    // 2026-07-16T07:30:00Z = 2026-07-16 00:30 PDT
    expect(businessTodayYmd(new Date("2026-07-16T07:30:00Z"))).toBe("2026-07-16");
  });
});

describe("businessToday", () => {
  it("materializes the PT calendar date at UTC midnight", () => {
    const d = businessToday(new Date("2026-07-16T03:00:00Z"));
    expect(d.toISOString()).toBe("2026-07-15T00:00:00.000Z");
  });
});
