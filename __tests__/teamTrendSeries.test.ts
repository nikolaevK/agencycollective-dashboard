import { describe, expect, it } from "vitest";
import {
  carryForwardGoals,
  foldTaskWeeks,
  sumAligned,
  trendWeeks,
  weekIndexOf,
} from "@/lib/teamTrendSeries";

describe("trendWeeks", () => {
  it("ends with the Monday of today's week", () => {
    // 2026-11-02 is a Monday; 2026-11-08 the Sunday of the same week.
    expect(trendWeeks("2026-11-02", 3)).toEqual(["2026-10-19", "2026-10-26", "2026-11-02"]);
    expect(trendWeeks("2026-11-08", 3)).toEqual(["2026-10-19", "2026-10-26", "2026-11-02"]);
    expect(trendWeeks("2026-11-09", 1)).toEqual(["2026-11-09"]);
  });

  it("crosses month and year boundaries", () => {
    expect(trendWeeks("2027-01-03", 2)).toEqual(["2026-12-21", "2026-12-28"]);
    expect(trendWeeks("2026-11-04")).toHaveLength(12);
  });
});

describe("weekIndexOf", () => {
  const weeks = ["2026-10-19", "2026-10-26", "2026-11-02"];
  it("maps each day of a Monday–Sunday week to its index", () => {
    expect(weekIndexOf("2026-10-19", weeks)).toBe(0);
    expect(weekIndexOf("2026-10-25", weeks)).toBe(0);
    expect(weekIndexOf("2026-10-26", weeks)).toBe(1);
    expect(weekIndexOf("2026-11-08", weeks)).toBe(2);
  });
  it("returns -1 outside the window", () => {
    expect(weekIndexOf("2026-10-18", weeks)).toBe(-1);
    expect(weekIndexOf("2026-11-09", weeks)).toBe(-1);
    expect(weekIndexOf("2026-11-02", [])).toBe(-1);
  });
});

describe("foldTaskWeeks", () => {
  it("counts created and completed per week, ignoring days outside the window", () => {
    const weeks = ["2026-10-19", "2026-10-26", "2026-11-02"];
    const out = foldTaskWeeks(
      [
        { createdYmd: "2026-10-20", completedYmd: "2026-10-27" },
        { createdYmd: "2026-10-21", completedYmd: null },
        { createdYmd: "2026-09-01", completedYmd: "2026-11-03" },
        { createdYmd: "2026-11-08", completedYmd: "2026-11-09" },
        { createdYmd: null, completedYmd: null },
      ],
      weeks
    );
    expect(out.created).toEqual([2, 0, 1]);
    expect(out.completed).toEqual([0, 1, 1]);
  });
});

describe("carryForwardGoals", () => {
  const months = ["2026-08", "2026-09", "2026-10", "2026-11"];
  it("carries the latest earlier goal into months without a row", () => {
    expect(
      carryForwardGoals(
        [
          { month: "2026-10", goalCents: 900_00 },
          { month: "2026-07", goalCents: 500_00 },
        ],
        months
      )
    ).toEqual([500_00, 500_00, 900_00, 900_00]);
  });
  it("is 0 before the first goal and never leaks future goals back", () => {
    expect(carryForwardGoals([{ month: "2026-10", goalCents: 1_00 }], months)).toEqual([0, 0, 1_00, 1_00]);
    expect(carryForwardGoals([{ month: "2027-01", goalCents: 1_00 }], months)).toEqual([0, 0, 0, 0]);
    expect(carryForwardGoals([], months)).toEqual([0, 0, 0, 0]);
  });
  it("lets a later explicit 0 clear the goal", () => {
    expect(
      carryForwardGoals(
        [
          { month: "2026-08", goalCents: 5_00 },
          { month: "2026-10", goalCents: 0 },
        ],
        months
      )
    ).toEqual([5_00, 5_00, 0, 0]);
  });
});

describe("sumAligned", () => {
  it("sums element-wise and tolerates empty series", () => {
    expect(sumAligned([[1, 2, 3], [], [10, 20, 30]], 3)).toEqual([11, 22, 33]);
    expect(sumAligned([], 2)).toEqual([0, 0]);
  });
});
