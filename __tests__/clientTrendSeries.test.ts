import { describe, it, expect } from "vitest";
import {
  foldClientMonths,
  hasActivity,
  joinedByMonth,
  rosterByMonth,
  sumSeries,
  trendMonths,
} from "@/lib/clientTrendSeries";

describe("trendMonths", () => {
  it("returns 12 months ending with the given month, across a year boundary", () => {
    const m = trendMonths("2026-02");
    expect(m).toHaveLength(12);
    expect(m[0]).toBe("2025-03");
    expect(m[10]).toBe("2026-01");
    expect(m[11]).toBe("2026-02");
  });

  it("supports other lengths", () => {
    expect(trendMonths("2026-11", 3)).toEqual(["2026-09", "2026-10", "2026-11"]);
  });
});

describe("foldClientMonths", () => {
  const months = trendMonths("2026-11", 3); // Sep, Oct, Nov

  it("sums brands per month and ignores months outside the window", () => {
    const s = foldClientMonths(
      "u1",
      months,
      [
        [
          { year: 2026, month: 8, amountDue: 999, amountPaid: 999 },
          { year: 2026, month: 9, amountDue: 100, amountPaid: 80 },
          { year: 2026, month: 11, amountDue: 300, amountPaid: 0 },
        ],
        [{ year: 2026, month: 9, amountDue: 50, amountPaid: 50 }],
      ],
      [[{ year: 2026, month: 11, amountDue: 300 }]]
    );
    expect(s).toEqual({
      id: "u1",
      billed: [150, 0, 300],
      collected: [130, 0, 0],
      rebilled: [0, 0, 300],
    });
    expect(hasActivity(s)).toBe(true);
  });

  it("flags a client with nothing in the window as inactive", () => {
    const s = foldClientMonths("u2", months, [[{ year: 2025, month: 1, amountDue: 5, amountPaid: 5 }]], []);
    expect(hasActivity(s)).toBe(false);
  });
});

describe("sumSeries", () => {
  const trends = {
    months: ["2026-10", "2026-11"],
    clients: [
      { id: "a", billed: [1, 2], collected: [1, 1], rebilled: [0, 2] },
      { id: "b", billed: [10, 20], collected: [5, 5], rebilled: [10, 0] },
    ],
  };

  it("sums every client when ids is null", () => {
    expect(sumSeries(trends, "billed", null)).toEqual([11, 22]);
  });

  it("sums only the given clients", () => {
    expect(sumSeries(trends, "rebilled", new Set(["a"]))).toEqual([0, 2]);
    expect(sumSeries(trends, "collected", new Set())).toEqual([0, 0]);
  });
});

describe("roster series", () => {
  const months = ["2026-09", "2026-10", "2026-11"];
  const joins = ["2026-09-15", "2026-11-01", null, "2026-11-30", "2024-01-01"];

  it("counts clients on the roster at each month end; the last point is the total", () => {
    expect(rosterByMonth(joins, months)).toEqual([3, 3, 5]);
  });

  it("counts joins per month", () => {
    expect(joinedByMonth(joins, months)).toEqual([1, 0, 2]);
  });
});
