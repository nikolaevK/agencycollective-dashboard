import { describe, it, expect } from "vitest";
import { parseImportedInvoice } from "@/components/invoice/importInvoice";
import { INITIAL_INVOICE_DATA, exportAsJson } from "@/lib/invoice/validation";
import type { InvoiceData } from "@/types/invoice";

function complete(): InvoiceData {
  const base = structuredClone(INITIAL_INVOICE_DATA);
  base.sender.name = "Agency";
  base.receiver.name = "Client";
  base.details.invoiceNumber = "INV-1";
  base.details.items = [{ id: "a", name: "Retainer", description: "", quantity: 1, unitPrice: 100, total: 100 }];
  return base;
}

describe("parseImportedInvoice", () => {
  it("accepts a full export", async () => {
    const data = complete();
    const raw = JSON.parse(await exportAsJson(data).text());
    const out = parseImportedInvoice(raw);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.data).toEqual(data);
  });

  it("accepts a draft the editor tolerates (blank names, no items, bad email) and fills defaults", () => {
    const data = structuredClone(INITIAL_INVOICE_DATA) as unknown as Record<string, Record<string, unknown>>;
    data.receiver.email = "not-an-email";
    delete data.receiver.address;
    delete data.receiver.customInputs;
    data.details.items = [{ id: "a", name: "", quantity: 1, unitPrice: 0, total: 0 }];
    const out = parseImportedInvoice(data);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.data.receiver.customInputs).toEqual([]);
    expect(out.data.receiver.address).toBe("");
    expect(out.data.receiver.email).toBe("not-an-email");
    expect(out.data.details.items[0].description).toBe("");

    const empty = structuredClone(INITIAL_INVOICE_DATA);
    empty.details.items = [];
    expect(parseImportedInvoice(empty).ok).toBe(true);
  });

  it("rejects files that would crash the editor, naming the field", () => {
    const sections = parseImportedInvoice({ sender: {}, receiver: {}, details: {} });
    expect(sections).toEqual({ ok: false, error: expect.stringContaining("sender.name") });

    const itemsString = complete() as unknown as { details: Record<string, unknown> };
    itemsString.details.items = "three hours";
    const bad = parseImportedInvoice(itemsString);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain("details.items");

    const numberEmail = complete() as unknown as { sender: Record<string, unknown> };
    numberEmail.sender.email = 5;
    expect(parseImportedInvoice(numberEmail)).toEqual({
      ok: false,
      error: "Not a valid invoice file — sender.email: Expected string, received number",
    });

    const badEnum = complete();
    badEnum.details.discountDetails = { amount: 5, amountType: "bogus" as "amount" };
    expect(parseImportedInvoice(badEnum).ok).toBe(false);

    expect(parseImportedInvoice(null).ok).toBe(false);
    expect(parseImportedInvoice([1, 2]).ok).toBe(false);
    expect(parseImportedInvoice("invoice").ok).toBe(false);
  });
});
