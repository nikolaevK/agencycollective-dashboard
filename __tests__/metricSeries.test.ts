import { describe, it, expect } from "vitest";
import {
  bucketCounts,
  bucketRanges,
  bucketize,
  lastMonthsRanges,
  ratePct,
  runningTotal,
  seriesGranularity,
  type DealDayRow,
} from "@/lib/metricSeries";

function deal(day: string, closedRevenue: number, extra: Partial<DealDayRow> = {}): DealDayRow {
  return {
    day,
    closerId: "c1",
    closedRevenue,
    paidRevenue: 0,
    outstandingRevenue: 0,
    pendingPipeline: 0,
    closedCount: closedRevenue > 0 ? 1 : 0,
    pendingCount: 0,
    inFlightCount: 0,
    ...extra,
  };
}

describe("seriesGranularity", () => {
  it("is daily up to a quarter, weekly up to a year, monthly beyond", () => {
    expect(seriesGranularity("2026-10-01", "2026-10-01")).toBe("day");
    expect(seriesGranularity("2026-07-01", "2026-09-30")).toBe("day"); // 92 days
    expect(seriesGranularity("2026-07-01", "2026-10-01")).toBe("week"); // 93 days
    expect(seriesGranularity("2024-01-01", "2024-12-31")).toBe("week"); // 366 days
    expect(seriesGranularity("2025-01-01", "2026-01-02")).toBe("month");
  });
});

describe("bucketRanges", () => {
  it("makes one bucket per day", () => {
    expect(bucketRanges("2026-10-30", "2026-11-01", "day")).toEqual([
      { start: "2026-10-30", end: "2026-10-30" },
      { start: "2026-10-31", end: "2026-10-31" },
      { start: "2026-11-01", end: "2026-11-01" },
    ]);
  });

  it("steps weeks from the window start and clips the last one", () => {
    expect(bucketRanges("2026-10-01", "2026-10-16", "week")).toEqual([
      { start: "2026-10-01", end: "2026-10-07" },
      { start: "2026-10-08", end: "2026-10-14" },
      { start: "2026-10-15", end: "2026-10-16" },
    ]);
  });

  it("uses calendar months clipped to the window (leap February)", () => {
    expect(bucketRanges("2028-01-15", "2028-03-10", "month")).toEqual([
      { start: "2028-01-15", end: "2028-01-31" },
      { start: "2028-02-01", end: "2028-02-29" },
      { start: "2028-03-01", end: "2028-03-10" },
    ]);
  });

  it("is empty for an inverted, malformed or impossible window", () => {
    expect(bucketRanges("2026-10-05", "2026-10-01", "day")).toEqual([]);
    expect(bucketRanges("nope", "2026-10-01", "day")).toEqual([]);
    expect(bucketRanges("2026-02-01", "2026-02-31", "day")).toEqual([]);
  });
});

describe("lastMonthsRanges", () => {
  it("covers whole months ending with the current one", () => {
    const r = lastMonthsRanges("2026-10-30", 12);
    expect(r).toHaveLength(12);
    expect(r[0]).toEqual({ start: "2025-11-01", end: "2025-11-30" });
    expect(r[11]).toEqual({ start: "2026-10-01", end: "2026-10-31" });
  });

  it("rolls back across a year boundary", () => {
    expect(lastMonthsRanges("2026-01-15", 3).map((x) => x.start)).toEqual([
      "2025-11-01",
      "2025-12-01",
      "2026-01-01",
    ]);
  });
});

describe("bucketize", () => {
  const ranges = bucketRanges("2026-10-01", "2026-10-03", "day");

  it("zero-fills and sums rows per bucket", () => {
    const b = bucketize(ranges, [
      deal("2026-10-01", 100),
      { ...deal("2026-10-01", 50), closerId: "c2" },
      deal("2026-10-03", 25, { paidRevenue: 25, pendingPipeline: 10, pendingCount: 1 }),
    ]);
    expect(b.map((x) => x.closedRevenue)).toEqual([150, 0, 25]);
    expect(b.map((x) => x.closedCount)).toEqual([2, 0, 1]);
    expect(b[2]).toMatchObject({ paidRevenue: 25, pendingPipeline: 10, pendingCount: 1 });
  });

  it("matches the SQL window: outside rows drop, totals equal the card", () => {
    const rows = [
      deal("2026-09-30", 1),
      deal("2026-10-01", 2),
      deal("2026-10-02T09:30:00", 4), // mid-window text sorts inside
      deal("2026-10-03", 8),
      deal("2026-10-03T09:30:00", 16), // > '2026-10-03', so SQL `<= until` excludes it
      deal("2026-10-04", 32),
    ];
    const inWindow = rows
      .filter((r) => r.day >= "2026-10-01" && r.day <= "2026-10-03")
      .reduce((s, r) => s + r.closedRevenue, 0);
    const b = bucketize(ranges, rows);
    expect(b.map((x) => x.closedRevenue)).toEqual([2, 4, 8]);
    expect(b.reduce((s, x) => s + x.closedRevenue, 0)).toBe(inWindow);
  });

  it("buckets attendance by day", () => {
    const b = bucketize(ranges, [], [
      { day: "2026-10-02", showCount: 3, noShowCount: 1 },
      { day: "2026-11-01", showCount: 9, noShowCount: 9 },
    ]);
    expect(b.map((x) => [x.showCount, x.noShowCount])).toEqual([
      [0, 0],
      [3, 1],
      [0, 0],
    ]);
  });

  it("returns nothing for no ranges", () => {
    expect(bucketize([], [deal("2026-10-01", 5)])).toEqual([]);
  });
});

describe("runningTotal / ratePct", () => {
  it("accumulates a value across buckets", () => {
    const b = bucketize(bucketRanges("2026-10-01", "2026-10-03", "day"), [
      deal("2026-10-01", 10),
      deal("2026-10-03", 5),
    ]);
    expect(runningTotal(b, (x) => x.closedRevenue)).toEqual([10, 10, 15]);
  });

  it("rounds to one decimal and is null without a denominator", () => {
    expect(ratePct(2, 3)).toBe(66.7);
    expect(ratePct(0, 4)).toBe(0);
    expect(ratePct(0, 0)).toBeNull();
  });
});

describe("bucketCounts", () => {
  it("folds per-day counts with bucketize's window rule", () => {
    const ranges = bucketRanges("2026-10-01", "2026-10-14", "week");
    expect(
      bucketCounts(ranges, [
        { day: "2026-09-30", count: 9 }, // before the window
        { day: "2026-10-01", count: 1 },
        { day: "2026-10-07", count: 2 },
        { day: "2026-10-08", count: 3 },
        { day: "2026-10-14", count: 1 },
        { day: "2026-10-15", count: 9 }, // after the window
      ])
    ).toEqual([3, 4]);
  });

  it("sums to the same total as the window's SQL bounds", () => {
    const ranges = lastMonthsRanges("2026-11-02", 12);
    const rows = [
      { day: "2025-12-01", count: 2 },
      { day: "2026-06-15", count: 1 },
      { day: "2026-11-30", count: 4 },
    ];
    const counts = bucketCounts(ranges, rows);
    expect(counts).toHaveLength(12);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(7);
    expect(counts[0]).toBe(2);
    expect(counts[11]).toBe(4);
  });

  it("returns zeros for an empty window", () => {
    expect(bucketCounts([], [{ day: "2026-10-01", count: 1 }])).toEqual([]);
  });
});
