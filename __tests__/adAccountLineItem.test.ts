import { describe, it, expect } from "vitest";
import {
  adInvoiceType,
  feeBpsToPercentLabel,
  computeAdSpendFeeCents,
  buildAdAccountLineItems,
} from "@/lib/adAccountLineItem";

describe("adInvoiceType", () => {
  it("classifies by which components are non-zero", () => {
    expect(adInvoiceType(100_00, 50_00)).toBe("combined");
    expect(adInvoiceType(0, 50_00)).toBe("ad_spend");
    expect(adInvoiceType(100_00, 0)).toBe("retainer");
    expect(adInvoiceType(0, 0)).toBe("retainer");
  });
});

describe("feeBpsToPercentLabel", () => {
  it("renders whole and half percents", () => {
    expect(feeBpsToPercentLabel(300)).toBe("3");
    expect(feeBpsToPercentLabel(350)).toBe("3.5");
  });
});

describe("computeAdSpendFeeCents", () => {
  it("uses integer-cents math with Math.round", () => {
    // $1,234.56 spend at 3.5% = 4320.96 cents → 4321
    expect(computeAdSpendFeeCents(123456, 350)).toBe(4321);
  });

  it("clamps negative spend to zero", () => {
    expect(computeAdSpendFeeCents(-500, 350)).toBe(0);
  });
});

describe("buildAdAccountLineItems", () => {
  it("emits both lines when both amounts are positive", () => {
    const items = buildAdAccountLineItems({
      retainerId: "r",
      adSpendId: "a",
      monthlyRetainerCents: 30000,
      spendCents: 100000,
      feeBps: 350,
    });
    expect(items.map((i) => i.id)).toEqual(["r", "a"]);
    expect(items[0].total).toBe(300);
    expect(items[1].total).toBe(35); // 3.5% of $1,000
  });

  it("drops a zero-amount line (retainer-only and ad-spend-only months)", () => {
    expect(
      buildAdAccountLineItems({ retainerId: "r", adSpendId: "a", monthlyRetainerCents: 30000 })
        .map((i) => i.id)
    ).toEqual(["r"]);
    expect(
      buildAdAccountLineItems({ retainerId: "r", adSpendId: "a", spendCents: 100000, feeBps: 300 })
        .map((i) => i.id)
    ).toEqual(["a"]);
  });

  it("defaults the fee to 350 bps and the provider to Agency Collective", () => {
    const [item] = buildAdAccountLineItems({
      retainerId: "r",
      adSpendId: "a",
      spendCents: 100000,
    });
    expect(item.name).toContain("3.5%");
    expect(item.description).toContain("Agency Collective");
  });
});
