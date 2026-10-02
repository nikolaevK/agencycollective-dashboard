import type { DiscountDetails, InvoiceData, InvoiceItem } from "@/types/invoice";
import { calculateTotals } from "./validation";
import { isRealYmd } from "../businessTime";

/**
 * Agent-friendly invoice input for the external API / MCP (v1 money
 * convention: integer CENTS). Applied over a server-built base invoice (the
 * same prefill the dashboard drawers start from), so an agent only states
 * what it wants different — line items, a discount, dates, notes — and never
 * has to reproduce sender / payment / logo blocks. Pure: no DB.
 */
export interface InvoiceSpecItem {
  name: string;
  description?: string;
  /** Defaults to 1. */
  quantity?: number;
  unitPriceCents: number;
}

export interface InvoiceSpec {
  /** Replaces the base invoice's line items when present. */
  items?: InvoiceSpecItem[];
  /** `value` is CENTS for "amount", a 0–100 percent for "percentage"; null clears it. */
  discount?: { type: "amount" | "percentage"; value: number } | null;
  invoiceDate?: string;
  dueDate?: string;
  /** Header terms line, e.g. "Due on receipt". */
  terms?: string;
  paymentTerms?: string;
  /** Printed as "Additional Notes". */
  notes?: string;
  billToName?: string;
}

const MAX_ITEMS = 100;
const MAX_PRICE_CENTS = 1_000_000_000; // $10M per line
const MAX_QTY = 1_000_000;

export type SpecResult<T> = { ok: true; value: T } | { ok: false; error: string };

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function optText(raw: unknown, field: string, max: number): SpecResult<string | undefined> {
  if (raw === undefined) return { ok: true, value: undefined };
  if (raw === null) return { ok: true, value: "" };
  if (typeof raw !== "string") return { ok: false, error: `${field} must be a string` };
  if (raw.length > max) return { ok: false, error: `${field} must be at most ${max} characters` };
  return { ok: true, value: raw };
}

/** Validate an untrusted `invoice` body field. */
export function parseInvoiceSpec(raw: unknown): SpecResult<InvoiceSpec> {
  if (!isObj(raw)) return { ok: false, error: "invoice must be an object" };
  const spec: InvoiceSpec = {};

  if (raw.items !== undefined) {
    if (!Array.isArray(raw.items) || raw.items.length === 0 || raw.items.length > MAX_ITEMS) {
      return { ok: false, error: `invoice.items must be an array of 1–${MAX_ITEMS} line items` };
    }
    const items: InvoiceSpecItem[] = [];
    for (let i = 0; i < raw.items.length; i++) {
      const it = raw.items[i];
      const at = `invoice.items[${i}]`;
      if (!isObj(it)) return { ok: false, error: `${at} must be an object` };
      const name = typeof it.name === "string" ? it.name.trim() : "";
      if (!name || name.length > 200) return { ok: false, error: `${at}.name is required (max 200 characters)` };
      const description = optText(it.description, `${at}.description`, 5000);
      if (!description.ok) return description;
      // typeof checks: Number(null) / Number("") / Number(false) would read as 0.
      const quantity = it.quantity === undefined ? 1 : it.quantity;
      if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_QTY) {
        return { ok: false, error: `${at}.quantity must be a positive number` };
      }
      const price = it.unitPriceCents;
      if (typeof price !== "number" || !Number.isInteger(price) || price < 0 || price > MAX_PRICE_CENTS) {
        return { ok: false, error: `${at}.unitPriceCents must be a non-negative integer (cents)` };
      }
      items.push({ name, description: description.value ?? "", quantity, unitPriceCents: price });
    }
    spec.items = items;
  }

  if (raw.discount !== undefined) {
    if (raw.discount === null) {
      spec.discount = null;
    } else {
      const d = raw.discount;
      if (!isObj(d) || (d.type !== "amount" && d.type !== "percentage")) {
        return { ok: false, error: 'invoice.discount must be { type: "amount" | "percentage", value }' };
      }
      const value = typeof d.value === "number" ? d.value : NaN;
      if (d.type === "amount" && (!Number.isInteger(value) || value < 0 || value > MAX_PRICE_CENTS)) {
        return { ok: false, error: "invoice.discount.value must be a non-negative integer (cents) for type amount" };
      }
      if (d.type === "percentage" && (!Number.isFinite(value) || value < 0 || value > 100)) {
        return { ok: false, error: "invoice.discount.value must be 0–100 for type percentage" };
      }
      spec.discount = { type: d.type, value };
    }
  }

  for (const key of ["invoiceDate", "dueDate"] as const) {
    const v = raw[key];
    if (v === undefined) continue;
    if (typeof v !== "string" || (v !== "" && !isRealYmd(v))) {
      return { ok: false, error: `invoice.${key} must be a real date (yyyy-mm-dd)` };
    }
    spec[key] = v;
  }

  const textFields: [keyof InvoiceSpec & string, number][] = [
    ["terms", 200],
    ["paymentTerms", 2000],
    ["notes", 2000],
    ["billToName", 100],
  ];
  for (const [key, max] of textFields) {
    const r = optText(raw[key], `invoice.${key}`, max);
    if (!r.ok) return r;
    if (r.value !== undefined) (spec as Record<string, unknown>)[key] = r.value;
  }

  return { ok: true, value: spec };
}

function specDiscount(d: NonNullable<InvoiceSpec["discount"]>): DiscountDetails {
  return d.type === "amount"
    ? { amount: Math.round(d.value) / 100, amountType: "amount" }
    : { amount: d.value, amountType: "percentage" };
}

/** Apply a validated spec over a base invoice; totals are recomputed. */
export function applyInvoiceSpec(base: InvoiceData, spec: InvoiceSpec): InvoiceData {
  const details = { ...base.details };
  if (spec.items) {
    details.items = spec.items.map((it): InvoiceItem => {
      const unitPrice = it.unitPriceCents / 100;
      const quantity = it.quantity ?? 1;
      return {
        id: crypto.randomUUID(),
        name: it.name,
        description: it.description ?? "",
        quantity,
        unitPrice,
        total: Math.round(quantity * unitPrice * 100) / 100,
      };
    });
  }
  if (spec.discount !== undefined) {
    details.discountDetails = spec.discount ? specDiscount(spec.discount) : null;
  }
  if (spec.invoiceDate !== undefined) details.invoiceDate = spec.invoiceDate;
  if (spec.dueDate !== undefined) details.dueDate = spec.dueDate;
  if (spec.terms !== undefined) details.terms = spec.terms;
  if (spec.paymentTerms !== undefined) details.paymentTerms = spec.paymentTerms;
  if (spec.notes !== undefined) details.additionalNotes = spec.notes;
  const receiver = spec.billToName ? { ...base.receiver, name: spec.billToName } : base.receiver;
  return { ...base, receiver, details: withComputedTotals(details) };
}

/** The inverse, for a reviewer's edits: the parts of an invoice a spec carries. */
export function invoiceToSpec(data: InvoiceData): InvoiceSpec {
  const d = data.details.discountDetails;
  return {
    items: data.details.items.map((it) => ({
      name: it.name,
      description: it.description,
      quantity: it.quantity,
      unitPriceCents: Math.round(it.unitPrice * 100),
    })),
    discount: d
      ? d.amountType === "amount"
        ? { type: "amount", value: Math.round(d.amount * 100) }
        : { type: "percentage", value: d.amount }
      : null,
    invoiceDate: data.details.invoiceDate,
    dueDate: data.details.dueDate,
    terms: data.details.terms,
    paymentTerms: data.details.paymentTerms,
    notes: data.details.additionalNotes,
    billToName: data.receiver.name,
  };
}

function withComputedTotals(details: InvoiceData["details"]): InvoiceData["details"] {
  const { subTotal, totalAmount } = calculateTotals(
    details.items,
    details.discountDetails,
    details.taxDetails,
    details.shippingDetails
  );
  return { ...details, subTotal, totalAmount };
}

/**
 * Harden raw `invoiceData` from an API caller before it's stored on a deal
 * invoice: the shape the drawer/PDF dereference must exist, item and invoice
 * totals are recomputed (a stale caller-supplied total would otherwise print),
 * and the printed number is pinned to the record's allocated number.
 */
export function normalizeApiInvoiceData(raw: unknown, invoiceNumber: string): SpecResult<InvoiceData> {
  if (!isObj(raw) || !isObj(raw.sender) || !isObj(raw.receiver) || !isObj(raw.details)) {
    return { ok: false, error: "invoiceData must contain sender, receiver and details objects" };
  }
  const details = raw.details as Record<string, unknown>;
  if (!Array.isArray(details.items) || details.items.length === 0 || details.items.length > MAX_ITEMS) {
    return { ok: false, error: `invoiceData.details.items must hold 1–${MAX_ITEMS} line items` };
  }
  const items: InvoiceItem[] = [];
  for (let i = 0; i < details.items.length; i++) {
    const it = details.items[i];
    if (!isObj(it)) return { ok: false, error: `invoiceData.details.items[${i}] must be an object` };
    const quantity = Number(it.quantity ?? 1);
    const unitPrice = Number(it.unitPrice ?? 0);
    if (!Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      return { ok: false, error: `invoiceData.details.items[${i}] needs non-negative quantity and unitPrice (dollars)` };
    }
    items.push({
      id: typeof it.id === "string" && it.id ? it.id : crypto.randomUUID(),
      name: typeof it.name === "string" ? it.name : "",
      description: typeof it.description === "string" ? it.description : "",
      quantity,
      unitPrice,
      total: Math.round(quantity * unitPrice * 100) / 100,
    });
  }
  // Charges feed the totals — a non-numeric amount would make them NaN.
  const charge = (v: unknown, valueKey: "amount" | "cost", typeKey: "amountType" | "costType", field: string) => {
    if (v == null) return { ok: true as const, value: null };
    if (
      !isObj(v) ||
      typeof v[valueKey] !== "number" ||
      !Number.isFinite(v[valueKey]) ||
      (v[valueKey] as number) < 0 ||
      (v[typeKey] !== "amount" && v[typeKey] !== "percentage")
    ) {
      return { ok: false as const, error: `invoiceData.details.${field} needs a non-negative numeric ${valueKey} and ${typeKey} "amount" | "percentage"` };
    }
    return { ok: true as const, value: v };
  };
  const discount = charge(details.discountDetails, "amount", "amountType", "discountDetails");
  if (!discount.ok) return discount;
  const tax = charge(details.taxDetails, "amount", "amountType", "taxDetails");
  if (!tax.ok) return tax;
  const shipping = charge(details.shippingDetails, "cost", "costType", "shippingDetails");
  if (!shipping.ok) return shipping;

  const data = raw as unknown as InvoiceData;
  const sender = raw.sender as Record<string, unknown>;
  const receiver = raw.receiver as Record<string, unknown>;
  return {
    ok: true,
    value: {
      ...data,
      sender: { ...data.sender, customInputs: Array.isArray(sender.customInputs) ? data.sender.customInputs : [] },
      receiver: { ...data.receiver, customInputs: Array.isArray(receiver.customInputs) ? data.receiver.customInputs : [] },
      details: withComputedTotals({
        ...data.details,
        invoiceNumber,
        items,
        discountDetails: discount.value ? data.details.discountDetails : null,
        taxDetails: tax.value ? data.details.taxDetails : null,
        shippingDetails: shipping.value ? data.details.shippingDetails : null,
      }),
    },
  };
}
