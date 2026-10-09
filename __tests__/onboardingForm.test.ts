import { describe, it, expect } from "vitest";
import {
  computeBreakEven,
  countAnswered,
  emptyAnswers,
  EXAMPLE_COSTS,
  hundredthsToInput,
  normalizeOnboardingAnswers,
  parseMoneyToCents,
  parsePercentToBps,
  TOTAL_QUESTIONS,
  NOTES_MAX,
} from "@/lib/onboardingForm";

describe("computeBreakEven", () => {
  it("matches the concept form's example order (1.85 ROAS, $48.17 CPA, 54.1%)", () => {
    const r = computeBreakEven(EXAMPLE_COSTS);
    expect(r.state).toBe("ok");
    if (r.state !== "ok") return;
    expect(r.roas.toFixed(2)).toBe("1.85");
    expect(r.contribution.toFixed(2)).toBe("48.17");
    expect((r.margin * 100).toFixed(1)).toBe("54.1");
  });

  it("is 'empty' with nothing entered and 'noaov' without an order value", () => {
    expect(computeBreakEven({ ...EXAMPLE_COSTS, ...nullCosts() }).state).toBe("empty");
    expect(computeBreakEven({ ...nullCosts(), cogsCents: 1000 }).state).toBe("noaov");
    expect(computeBreakEven({ ...nullCosts(), aovCents: 0 }).state).toBe("noaov");
  });

  it("reports an infinite break-even ROAS when each order loses money", () => {
    const r = computeBreakEven({ ...nullCosts(), aovCents: 5000, cogsCents: 6000 });
    expect(r.state).toBe("ok");
    if (r.state !== "ok") return;
    expect(r.contribution).toBeLessThan(0);
    expect(r.roas).toBe(Infinity);
  });

  it("treats blank cost lines as zero", () => {
    const r = computeBreakEven({ ...nullCosts(), aovCents: 10000, processingBps: 1000 });
    expect(r.state === "ok" && r.roas).toBeCloseTo(1 / 0.9, 10);
  });
});

function nullCosts() {
  return {
    aovCents: null,
    cogsCents: null,
    shippingCents: null,
    fulfillmentCents: null,
    processingBps: null,
    otherCents: null,
    refundsBps: null,
  };
}

describe("normalizeOnboardingAnswers", () => {
  it("never throws on junk and returns a blank form", () => {
    expect(normalizeOnboardingAnswers(null)).toEqual(emptyAnswers());
    expect(normalizeOnboardingAnswers("x")).toEqual(emptyAnswers());
    expect(normalizeOnboardingAnswers([1, 2])).toEqual(emptyAnswers());
  });

  it("keeps known choices, drops unknown slugs, de-dupes multi-selects in vocab order", () => {
    const a = normalizeOnboardingAnswers({
      monthlyRevenue: "10k_50k",
      primaryGoal: "world_domination",
      sells: ["supplements", "telehealth", "supplements", "nope"],
      access: { meta: "using", google: "maybe", unknown: "using" },
    });
    expect(a.monthlyRevenue).toBe("10k_50k");
    expect(a.primaryGoal).toBeNull();
    expect(a.sells).toEqual(["telehealth", "supplements"]);
    expect(a.access).toEqual({ meta: "using" });
  });

  it("makes 'Nothing yet' exclusive of real channels", () => {
    expect(normalizeOnboardingAnswers({ channels: ["none", "meta"] }).channels).toEqual(["meta"]);
    expect(normalizeOnboardingAnswers({ channels: ["none"] }).channels).toEqual(["none"]);
  });

  it("bounds money and percentages, rounding to integers", () => {
    const a = normalizeOnboardingAnswers({
      aovCents: 8900.4,
      cogsCents: -5,
      shippingCents: "740",
      processingBps: 350,
      refundsBps: 10_001,
    });
    expect(a.aovCents).toBe(8900);
    expect(a.cogsCents).toBeNull();
    expect(a.shippingCents).toBeNull();
    expect(a.processingBps).toBe(350);
    expect(a.refundsBps).toBeNull();
  });

  it("trims and caps text", () => {
    const a = normalizeOnboardingAnswers({ brandName: "  Acme  ", notes: "x".repeat(NOTES_MAX + 50) });
    expect(a.brandName).toBe("Acme");
    expect(a.notes.length).toBe(NOTES_MAX);
  });
});

describe("countAnswered", () => {
  it("counts the concept form's 33 questions", () => {
    expect(TOTAL_QUESTIONS).toBe(33);
    expect(countAnswered(emptyAnswers())).toBe(0);
  });

  it("counts zero amounts as answered and per-platform access separately", () => {
    const a = { ...emptyAnswers(), brandName: "Acme", adSpendNowCents: 0, access: { meta: "using", tiktok: "setup" } };
    expect(countAnswered(a)).toBe(4);
  });
});

describe("input conversions", () => {
  it("parses typed money and percentages", () => {
    expect(parseMoneyToCents("$1,250.50")).toBe(125050);
    expect(parseMoneyToCents("7.4")).toBe(740);
    expect(parseMoneyToCents("")).toBeNull();
    expect(parsePercentToBps("3.5")).toBe(350);
  });

  it("never reads a decimal comma as a thousands separator", () => {
    expect(parseMoneyToCents("12,50")).toBeNull();
    expect(parseMoneyToCents("1,250")).toBe(125000);
    expect(parsePercentToBps("3,5")).toBe(350);
  });

  it("round-trips stored hundredths back to input text", () => {
    expect(hundredthsToInput(740)).toBe("7.4");
    expect(hundredthsToInput(8900)).toBe("89");
    expect(hundredthsToInput(null)).toBe("");
    expect(parseMoneyToCents(hundredthsToInput(325))).toBe(325);
  });
});
