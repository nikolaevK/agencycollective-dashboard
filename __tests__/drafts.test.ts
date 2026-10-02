import { describe, expect, it } from "vitest";
import {
  applyInvoiceSpec,
  invoiceToSpec,
  normalizeApiInvoiceData,
  parseInvoiceSpec,
} from "@/lib/invoice/invoiceSpec";
import { parseDealDraftFields } from "@/lib/dealDraftFields";
import { parseInvoiceDraftOptions } from "@/lib/invoiceDraftInput";
import { addCc, finalizeCcList, isValidEmail, extractEmails, normalizeCcList } from "@/lib/invoice/email";
import { INITIAL_INVOICE_DATA } from "@/lib/invoice/validation";
import type { InvoiceData } from "@/types/invoice";

function base(): InvoiceData {
  return {
    ...INITIAL_INVOICE_DATA,
    receiver: { ...INITIAL_INVOICE_DATA.receiver, name: "Acme" },
    details: {
      ...INITIAL_INVOICE_DATA.details,
      invoiceNumber: "INV-1",
      items: [{ id: "a", name: "Retainer", description: "", quantity: 1, unitPrice: 1000, total: 1000 }],
      subTotal: 1000,
      totalAmount: 1000,
    },
  };
}

describe("parseInvoiceSpec", () => {
  it("accepts a full spec and defaults quantity to 1", () => {
    const r = parseInvoiceSpec({
      items: [{ name: "Ads", unitPriceCents: 150000 }],
      discount: { type: "percentage", value: 10 },
      dueDate: "2026-11-01",
      notes: "Thanks",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.items?.[0].quantity).toBe(1);
  });

  it.each([
    [{ items: [] }, "items"],
    [{ items: [{ name: "", unitPriceCents: 1 }] }, "name"],
    [{ items: [{ name: "x", unitPriceCents: 1.5 }] }, "unitPriceCents"],
    [{ items: [{ name: "x", unitPriceCents: -1 }] }, "unitPriceCents"],
    [{ items: [{ name: "x", unitPriceCents: 1, quantity: 0 }] }, "quantity"],
    [{ discount: { type: "percentage", value: 120 } }, "discount"],
    [{ discount: { type: "amount", value: 9.99 } }, "discount"],
    [{ dueDate: "11/01/2026" }, "dueDate"],
    ["nope", "object"],
  ])("rejects %j", (input, needle) => {
    const r = parseInvoiceSpec(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(needle);
  });
});

describe("applyInvoiceSpec", () => {
  it("replaces items (cents → dollars) and recomputes totals with the discount", () => {
    const spec = parseInvoiceSpec({
      items: [
        { name: "Ads", unitPriceCents: 150000, quantity: 2 },
        { name: "Setup", unitPriceCents: 49999 },
      ],
      discount: { type: "amount", value: 10000 },
    });
    if (!spec.ok) throw new Error(spec.error);
    const out = applyInvoiceSpec(base(), spec.value);
    expect(out.details.items.map((i) => [i.unitPrice, i.total])).toEqual([
      [1500, 3000],
      [499.99, 499.99],
    ]);
    expect(out.details.subTotal).toBe(3499.99);
    expect(out.details.discountDetails).toEqual({ amount: 100, amountType: "amount" });
    expect(out.details.totalAmount).toBe(3399.99);
  });

  it("keeps base items when the spec has none, and a null discount clears it", () => {
    const withDiscount = { ...base(), details: { ...base().details, discountDetails: { amount: 5, amountType: "percentage" as const } } };
    const out = applyInvoiceSpec(withDiscount, { discount: null, billToName: "Acme Inc" });
    expect(out.details.items).toHaveLength(1);
    expect(out.details.discountDetails).toBeNull();
    expect(out.details.totalAmount).toBe(1000);
    expect(out.receiver.name).toBe("Acme Inc");
  });

  it("round-trips through invoiceToSpec", () => {
    const spec = parseInvoiceSpec({ items: [{ name: "Ads", unitPriceCents: 12345, quantity: 3 }], discount: { type: "percentage", value: 5 } });
    if (!spec.ok) throw new Error(spec.error);
    const once = applyInvoiceSpec(base(), spec.value);
    const twice = applyInvoiceSpec(base(), invoiceToSpec(once));
    expect(twice.details.totalAmount).toBe(once.details.totalAmount);
    expect(twice.details.items.map((i) => i.unitPrice)).toEqual([123.45]);
  });
});

describe("normalizeApiInvoiceData", () => {
  it("recomputes stale totals and pins the invoice number", () => {
    const raw = { ...base(), details: { ...base().details, invoiceNumber: "WRONG", totalAmount: 999999 } };
    const r = normalizeApiInvoiceData(raw, "INV-REAL");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.details.invoiceNumber).toBe("INV-REAL");
      expect(r.value.details.totalAmount).toBe(1000);
    }
  });

  it("rejects shapes the drawer/PDF would crash on", () => {
    expect(normalizeApiInvoiceData({ details: {} }, "X").ok).toBe(false);
    expect(normalizeApiInvoiceData({ ...base(), details: { ...base().details, items: [] } }, "X").ok).toBe(false);
  });
});

describe("parseDealDraftFields", () => {
  const minimal = { closerId: "c1", clientName: "Acme", dealValue: 500000 };

  it("applies closer-form defaults", () => {
    const r = parseDealDraftFields(minimal);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.status).toBe("closed");
      expect(r.value.paymentType).toBe("local");
      expect(r.value.paidStatus).toBe("unpaid");
    }
  });

  it("requires a positive value unless the deal was lost", () => {
    expect(parseDealDraftFields({ ...minimal, dealValue: 0 }).ok).toBe(false);
    expect(parseDealDraftFields({ ...minimal, dealValue: 0, status: "not_closed" }).ok).toBe(true);
    expect(parseDealDraftFields({ ...minimal, dealValue: 10.5 }).ok).toBe(false);
  });

  it("normalizes services, emails and CCs", () => {
    const r = parseDealDraftFields({
      ...minimal,
      serviceCategory: ["Meta Ads", "", "Google Ads"],
      clientEmail: "Owner@Acme.com",
      additionalCcEmails: ["a@acme.com", "A@acme.com", "owner@acme.com"],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.serviceCategory).toBe(JSON.stringify(["Meta Ads", "Google Ads"]));
      expect(r.value.clientEmail).toBe("owner@acme.com");
      expect(r.value.additionalCcEmails).toEqual(["a@acme.com"]);
    }
  });

  it("rejects invalid enums / formats", () => {
    expect(parseDealDraftFields({ ...minimal, status: "won" }).ok).toBe(false);
    expect(parseDealDraftFields({ ...minimal, paymentType: "wire" }).ok).toBe(false);
    expect(parseDealDraftFields({ ...minimal, closingDate: "2026/10/02" }).ok).toBe(false);
    expect(parseDealDraftFields({ ...minimal, clientEmail: "nope" }).ok).toBe(false);
    expect(parseDealDraftFields({ ...minimal, setterTier: "E" }).ok).toBe(false);
  });

  it("partial update keeps unspecified fields", () => {
    const first = parseDealDraftFields({ ...minimal, notes: "from call" });
    if (!first.ok) throw new Error(first.error);
    const r = parseDealDraftFields({ dealValue: 600000 }, first.value);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.dealValue).toBe(600000);
      expect(r.value.notes).toBe("from call");
      expect(r.value.clientName).toBe("Acme");
    }
  });
});

describe("CC rules", () => {
  it("validates, dedupes, excludes the recipient and caps", () => {
    expect(isValidEmail(" a@b.co ")).toBe(true);
    expect(isValidEmail("a@b")).toBe(false);
    let list: string[] = [];
    const add = (v: string, max?: number) => {
      const r = addCc(list, v, { max, exclude: ["client@x.com"] });
      if (r.ok) list = r.list;
      return r;
    };
    expect(add("One@X.com").ok).toBe(true);
    expect(list).toEqual(["one@x.com"]);
    expect(add("one@x.com")).toMatchObject({ ok: false, code: "duplicate" });
    expect(add("client@x.com")).toMatchObject({ ok: false, code: "recipient" });
    expect(add("two@x.com", 1)).toMatchObject({ ok: false, code: "max" });
  });

  it("finalize commits pending text, tolerates harmless repeats, blocks bad input", () => {
    expect(finalizeCcList(["a@x.com"], "b@x.com,")).toEqual({ ok: true, list: ["a@x.com", "b@x.com"] });
    expect(finalizeCcList(["a@x.com"], "a@x.com")).toEqual({ ok: true, list: ["a@x.com"] });
    expect(finalizeCcList([], "client@x.com", { exclude: ["client@x.com"] })).toEqual({ ok: true, list: [] });
    expect(finalizeCcList([], "not-an-email").ok).toBe(false);
  });
});

describe("strict draft input (audit fixes)", () => {
  it("rejects non-number money instead of reading it as 0", () => {
    for (const unitPriceCents of [null, "", false, "1500"]) {
      expect(parseInvoiceSpec({ items: [{ name: "Ads", unitPriceCents }] }).ok).toBe(false);
    }
    expect(parseInvoiceSpec({ discount: { type: "amount", value: "500" } }).ok).toBe(false);
    expect(parseDealDraftFields({ closerId: "c1", clientName: "Acme", dealValue: "500000" }).ok).toBe(false);
    expect(parseDealDraftFields({ closerId: "c1", clientName: "Acme", dealValue: 500000 }).ok).toBe(true);
  });

  it("rejects impossible calendar dates", () => {
    expect(parseInvoiceSpec({ dueDate: "2026-02-31" }).ok).toBe(false);
    expect(parseInvoiceSpec({ dueDate: "2026-13-01" }).ok).toBe(false);
    expect(parseInvoiceSpec({ dueDate: "2028-02-29" }).ok).toBe(true);
    expect(
      parseDealDraftFields({ closerId: "c1", clientName: "Acme", dealValue: 100, closingDate: "2026-04-31" }).ok
    ).toBe(false);
    expect(parseInvoiceDraftOptions({ cycleAnchor: "2026-02-31" }).ok).toBe(false);
    expect(parseInvoiceDraftOptions({ cycleAnchor: "2026-02-28" }).ok).toBe(true);
    expect(parseInvoiceDraftOptions({ retainerCents: "" }).ok).toBe(false);
  });

  it("normalizeApiInvoiceData rejects malformed charges (would total NaN)", () => {
    const withCharge = (key: string, value: unknown) => ({
      ...base(),
      details: { ...base().details, [key]: value },
    });
    expect(normalizeApiInvoiceData(withCharge("discountDetails", { amount: "abc", amountType: "amount" }), "INV-9").ok).toBe(false);
    expect(normalizeApiInvoiceData(withCharge("taxDetails", { amount: 5, amountType: "weird", taxId: "" }), "INV-9").ok).toBe(false);
    expect(normalizeApiInvoiceData(withCharge("shippingDetails", { cost: -1, costType: "amount" }), "INV-9").ok).toBe(false);
    const ok = normalizeApiInvoiceData(withCharge("discountDetails", { amount: 100, amountType: "amount" }), "INV-9");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.details.totalAmount).toBe(900);
  });
});

describe("email parsing (audit fixes)", () => {
  it("rejects address-syntax characters a paste can drag in", () => {
    expect(isValidEmail("<jane@x.com>")).toBe(false);
    expect(isValidEmail("jane doe@x.com")).toBe(false);
    expect(isValidEmail("a.b+tag@sub-domain.co.uk")).toBe(true);
  });

  it("extracts addresses from name-style and mixed lists", () => {
    expect(extractEmails("Jane Doe <jane@x.com>, Bob <bob@y.org>; c@d.io")).toEqual([
      "jane@x.com",
      "bob@y.org",
      "c@d.io",
    ]);
    expect(extractEmails("no address here")).toEqual([]);
  });

  it("normalizes seeded CC lists", () => {
    expect(normalizeCcList(["Bob@X.com", "bob@x.com", " not-an-email ", "a@b.co"])).toEqual(["bob@x.com", "a@b.co"]);
  });
});
