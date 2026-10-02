import { describe, it, expect } from "vitest";
import type { InvoiceItem } from "@/types/invoice";
import {
  calculateTotals,
  discountValueOf,
  taxValueOf,
  shippingValueOf,
  lineAmountOf,
  parseDecimalInput,
  formatCurrencyValue,
} from "@/lib/invoice/validation";

function item(quantity: number, unitPrice: number): InvoiceItem {
  return { id: `${quantity}x${unitPrice}`, name: "Item", description: "", quantity, unitPrice, total: quantity * unitPrice };
}

describe("discountValueOf", () => {
  it("resolves amount and percentage discounts", () => {
    expect(discountValueOf(200, { amount: 50, amountType: "amount" })).toBe(50);
    expect(discountValueOf(200, { amount: 10, amountType: "percentage" })).toBe(20);
    expect(discountValueOf(200, null)).toBe(0);
  });

  it("clamps to the subtotal and never goes negative", () => {
    expect(discountValueOf(100, { amount: 500, amountType: "amount" })).toBe(100);
    expect(discountValueOf(100, { amount: 150, amountType: "percentage" })).toBe(100);
    expect(discountValueOf(100, { amount: -50, amountType: "amount" })).toBe(0);
    expect(discountValueOf(-20, { amount: 10, amountType: "amount" })).toBe(0);
    expect(discountValueOf(100, { amount: -10, amountType: "percentage" })).toBe(0);
  });

  it("rounds to cents and treats a non-finite amount as 0", () => {
    expect(discountValueOf(99.99, { amount: 12.5, amountType: "percentage" })).toBe(12.5); // 12.49875
    expect(discountValueOf(100, { amount: NaN, amountType: "amount" })).toBe(0);
  });
});

describe("taxValueOf / shippingValueOf", () => {
  it("resolves amount and percentage values on the given subtotal", () => {
    expect(taxValueOf(200, { amount: 15, amountType: "amount" })).toBe(15);
    expect(taxValueOf(200, { amount: 7.5, amountType: "percentage" })).toBe(15);
    expect(shippingValueOf(200, { cost: 12, costType: "amount" })).toBe(12);
    expect(shippingValueOf(200, { cost: 5, costType: "percentage" })).toBe(10);
    expect(taxValueOf(200, null)).toBe(0);
    expect(shippingValueOf(200, null)).toBe(0);
  });

  it("clamps negative values to zero", () => {
    expect(taxValueOf(200, { amount: -15, amountType: "amount" })).toBe(0);
    expect(taxValueOf(200, { amount: -10, amountType: "percentage" })).toBe(0);
    expect(shippingValueOf(200, { cost: -12, costType: "amount" })).toBe(0);
    expect(shippingValueOf(200, { cost: -5, costType: "percentage" })).toBe(0);
  });

  it("rounds to cents and treats non-finite values as 0", () => {
    expect(taxValueOf(99.99, { amount: 7.25, amountType: "percentage" })).toBe(7.25); // 7.249275
    expect(shippingValueOf(33.33, { cost: 3, costType: "percentage" })).toBe(1); // 0.9999
    expect(taxValueOf(NaN, { amount: 10, amountType: "percentage" })).toBe(0);
    expect(shippingValueOf(100, { cost: Infinity, costType: "amount" })).toBe(0);
  });
});

describe("lineAmountOf", () => {
  it("rounds quantity x unit price to cents", () => {
    expect(lineAmountOf(item(3, 33.333))).toBe(100);
    expect(lineAmountOf(item(1, 33.333))).toBe(33.33);
    expect(lineAmountOf(item(1.5, 10))).toBe(15);
  });

  it("treats non-finite quantity / unit price as 0", () => {
    expect(lineAmountOf(item(NaN, 10))).toBe(0);
    expect(lineAmountOf(item(2, NaN))).toBe(0);
  });
});

describe("calculateTotals", () => {
  it("sums quantity x unit price", () => {
    expect(calculateTotals([item(3, 100), item(1, 50)], null, null, null)).toEqual({
      subTotal: 350,
      totalAmount: 350,
    });
  });

  it("applies tax and shipping on the PRE-discount subtotal", () => {
    // 200 - 20 (10%) + 20 (10% of 200, not of 180) + 10 (5% of 200)
    expect(
      calculateTotals(
        [item(2, 100)],
        { amount: 10, amountType: "percentage" },
        { amount: 10, amountType: "percentage" },
        { cost: 5, costType: "percentage" }
      )
    ).toEqual({ subTotal: 200, totalAmount: 210 });
  });

  it("caps an oversized discount at the subtotal", () => {
    expect(calculateTotals([item(1, 100)], { amount: 500, amountType: "amount" }, null, null)).toEqual({
      subTotal: 100,
      totalAmount: 0,
    });
  });

  it("ignores negative tax and shipping instead of lowering the total", () => {
    expect(
      calculateTotals(
        [item(1, 100)],
        null,
        { amount: -30, amountType: "amount" },
        { cost: -10, costType: "amount" }
      ).totalAmount
    ).toBe(100);
  });

  it("never returns a total below zero", () => {
    expect(calculateTotals([item(1, -50)], null, null, null).totalAmount).toBe(0);
  });

  it("rounds subtotal and total to cents", () => {
    expect(calculateTotals([item(3, 0.1)], null, null, null)).toEqual({ subTotal: 0.3, totalAmount: 0.3 });
    // 99.99 + 7.25% tax (7.249275) = 107.239275
    expect(calculateTotals([item(1, 99.99)], null, { amount: 7.25, amountType: "percentage" }, null)).toEqual({
      subTotal: 99.99,
      totalAmount: 107.24,
    });
  });

  it("sums the cent-rounded line amounts, so printed lines add up to the subtotal", () => {
    // Each line prints $33.33 — the subtotal must be $99.99, not round(99.999) = $100.00.
    const items = [item(1, 33.333), item(1, 33.333), item(1, 33.333)];
    expect(calculateTotals(items, null, null, null)).toEqual({ subTotal: 99.99, totalAmount: 99.99 });
    expect(items.reduce((sum, it) => sum + lineAmountOf(it), 0)).toBeCloseTo(99.99, 10);
  });

  it("totals exactly the printed parts (each charge rounded to cents)", () => {
    // subtotal 99.99; discount 12.5% = 12.49875 → 12.50; tax 7.25% = 7.249275 → 7.25;
    // shipping 3% = 2.9997 → 3.00 → 99.99 - 12.50 + 7.25 + 3.00 = 97.74
    const discount = { amount: 12.5, amountType: "percentage" as const };
    const tax = { amount: 7.25, amountType: "percentage" as const };
    const shipping = { cost: 3, costType: "percentage" as const };
    const { subTotal, totalAmount } = calculateTotals([item(1, 99.99)], discount, tax, shipping);
    expect(totalAmount).toBe(97.74);
    expect(totalAmount).toBeCloseTo(
      subTotal - discountValueOf(subTotal, discount) + taxValueOf(subTotal, tax) + shippingValueOf(subTotal, shipping),
      10
    );
  });

  it("treats non-finite items and charges as 0 instead of returning NaN", () => {
    expect(
      calculateTotals(
        [item(NaN, 10), item(1, 50)],
        { amount: NaN, amountType: "amount" },
        { amount: NaN, amountType: "percentage" },
        { cost: NaN, costType: "amount" }
      )
    ).toEqual({ subTotal: 50, totalAmount: 50 });
  });
});

describe("formatCurrencyValue", () => {
  it("never prints $NaN", () => {
    expect(formatCurrencyValue(NaN, "USD")).toBe("$0.00");
    expect(formatCurrencyValue(1234.5, "USD")).toBe("$1,234.50");
  });
});

describe("parseDecimalInput", () => {
  it("parses plain numbers and keeps in-progress text valid", () => {
    expect(parseDecimalInput("")).toBe(0);
    expect(parseDecimalInput(".")).toBe(0);
    expect(parseDecimalInput("0.")).toBe(0);
    expect(parseDecimalInput("1.")).toBe(1);
    expect(parseDecimalInput("0.5")).toBe(0.5);
    expect(parseDecimalInput("1500")).toBe(1500);
  });

  it("strips $ and spaces and treats commas before a dot as grouping", () => {
    expect(parseDecimalInput("$1,500.00")).toBe(1500);
    expect(parseDecimalInput(" $ 1 500.5 ")).toBe(1500.5);
    expect(parseDecimalInput("12,345,678.90")).toBe(12345678.9);
  });

  it("reads a comma + exactly 3 digits as grouping, a final comma + 0–2 digits as the decimal point", () => {
    expect(parseDecimalInput("1,500")).toBe(1500);
    expect(parseDecimalInput("1,500,000")).toBe(1500000);
    expect(parseDecimalInput("1,5")).toBe(1.5);
    expect(parseDecimalInput("12,34")).toBe(12.34);
    expect(parseDecimalInput("1,")).toBe(1);
    expect(parseDecimalInput("1,500,")).toBe(1500); // typing 1,500,000
    expect(parseDecimalInput("1,500,0")).toBe(1500);
  });

  it("limits fraction digits", () => {
    expect(parseDecimalInput("1.234")).toBeNull();
    expect(parseDecimalInput("1.23")).toBe(1.23);
    expect(parseDecimalInput("1.2345", 4)).toBe(1.2345);
    expect(parseDecimalInput("1.23456", 4)).toBeNull();
  });

  it("rejects anything that isn't a non-negative number", () => {
    expect(parseDecimalInput("-5")).toBeNull();
    expect(parseDecimalInput("abc")).toBeNull();
    expect(parseDecimalInput("1e5")).toBeNull();
    expect(parseDecimalInput("1.2.3")).toBeNull();
    expect(parseDecimalInput("1.5,0")).toBeNull();
    expect(parseDecimalInput("1,5000")).toBeNull();
    expect(parseDecimalInput("1,,500")).toBeNull();
  });
});
