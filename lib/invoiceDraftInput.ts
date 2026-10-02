import type { InvoiceData, PaymentType } from "@/types/invoice";
import { addCc, isValidEmail } from "./invoice/email";
import { normalizeApiInvoiceData } from "./invoice/invoiceSpec";
import { isRealYmd } from "./businessTime";
import type { InvoiceDraftOptions } from "./invoiceDrafts";

/**
 * Validation for invoice-draft writes, shared by the dashboard routes (which
 * send a full drawer InvoiceData) and the v1 routes (which build InvoiceData
 * server-side from a prefill + InvoiceSpec). Pure — no DB.
 */
export interface InvoiceDraftPatch {
  invoiceData?: InvoiceData;
  recipientEmail?: string | null;
  ccEmails?: string[];
  paymentType?: PaymentType;
  options?: InvoiceDraftOptions;
  note?: string | null;
}

export type DraftInputResult = { ok: true; value: InvoiceDraftPatch } | { ok: false; error: string };

const MAX_INVOICE_JSON = 1_000_000; // same cap as deal invoice PATCH

function nonNegInt(raw: unknown, field: string, max: number): { ok: true; value: number } | { ok: false; error: string } {
  // typeof check: Number("") / Number(false) would silently read as 0.
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0 || raw > max) {
    return { ok: false, error: `${field} must be a non-negative integer` };
  }
  return { ok: true, value: raw };
}

export function parseInvoiceDraftOptions(raw: unknown): { ok: true; value: InvoiceDraftOptions } | { ok: false; error: string } {
  if (raw == null) return { ok: true, value: {} };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "options must be an object" };
  const o = raw as Record<string, unknown>;
  const out: InvoiceDraftOptions = {};
  for (const key of ["retainerCents", "spendCents"] as const) {
    if (o[key] === undefined || o[key] === null) continue;
    const r = nonNegInt(o[key], key, 1_000_000_000);
    if (!r.ok) return r;
    out[key] = r.value;
  }
  if (o.feeBps !== undefined && o.feeBps !== null) {
    const r = nonNegInt(o.feeBps, "feeBps", 10_000);
    if (!r.ok) return r;
    out.feeBps = r.value;
  }
  if (o.lineIds !== undefined && o.lineIds !== null) {
    const l = o.lineIds as Record<string, unknown>;
    const ok = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 100;
    if (typeof l !== "object" || !ok(l.retainer) || !ok(l.adSpend)) {
      return { ok: false, error: "lineIds must be { retainer, adSpend } ids" };
    }
    out.lineIds = { retainer: String(l.retainer), adSpend: String(l.adSpend) };
  }
  if (o.styleProfileId !== undefined) {
    if (o.styleProfileId === null || o.styleProfileId === "") out.styleProfileId = null;
    else if (typeof o.styleProfileId === "string" && o.styleProfileId.length <= 100) out.styleProfileId = o.styleProfileId;
    else return { ok: false, error: "styleProfileId must be a profile id" };
  }
  if (o.cycleAnchor !== undefined) {
    if (o.cycleAnchor === null || o.cycleAnchor === "") out.cycleAnchor = null;
    // A real date: the send route would otherwise email first and only then
    // reject an impossible cycle (2026-02-31) — inviting a duplicate re-send.
    else if (typeof o.cycleAnchor === "string" && isRealYmd(o.cycleAnchor)) out.cycleAnchor = o.cycleAnchor;
    else return { ok: false, error: "cycleAnchor must be a real date (yyyy-mm-dd)" };
  }
  return { ok: true, value: out };
}

/**
 * Parse the optional draft fields from a request body. `invoiceData` (raw,
 * dashboard only) is structurally validated and its totals recomputed.
 */
export function parseInvoiceDraftPatch(
  body: Record<string, unknown>,
  opts: { allowInvoiceData: boolean }
): DraftInputResult {
  const out: InvoiceDraftPatch = {};

  if (body.invoiceData !== undefined) {
    if (!opts.allowInvoiceData) return { ok: false, error: "Send `invoice` (an InvoiceSpec), not invoiceData" };
    if (JSON.stringify(body.invoiceData ?? null).length > MAX_INVOICE_JSON) {
      return { ok: false, error: "invoiceData is too large" };
    }
    const raw = body.invoiceData as { details?: { invoiceNumber?: unknown } } | null;
    const number = String(raw?.details?.invoiceNumber ?? "").trim().slice(0, 100);
    if (!number) return { ok: false, error: "invoiceData.details.invoiceNumber is required" };
    const norm = normalizeApiInvoiceData(body.invoiceData, number);
    if (!norm.ok) return norm;
    out.invoiceData = norm.value;
  }

  if (body.recipientEmail !== undefined) {
    const e = body.recipientEmail == null ? "" : String(body.recipientEmail).trim();
    if (e && !isValidEmail(e)) return { ok: false, error: "recipientEmail is not a valid email" };
    out.recipientEmail = e || null;
  }

  if (body.ccEmails !== undefined) {
    if (body.ccEmails !== null && !Array.isArray(body.ccEmails)) return { ok: false, error: "ccEmails must be an array" };
    let list: string[] = [];
    for (const addr of (body.ccEmails as unknown[] | null) ?? []) {
      const res = addCc(list, String(addr ?? ""), { exclude: [out.recipientEmail] });
      if (res.ok) list = res.list;
      else if (res.code !== "duplicate" && res.code !== "recipient") return { ok: false, error: `ccEmails: ${res.error}` };
    }
    out.ccEmails = list;
  }

  if (body.paymentType !== undefined) {
    if (body.paymentType !== "local" && body.paymentType !== "international") {
      return { ok: false, error: "paymentType must be local or international" };
    }
    out.paymentType = body.paymentType;
  }

  if (body.options !== undefined) {
    const r = parseInvoiceDraftOptions(body.options);
    if (!r.ok) return r;
    out.options = r.value;
  }

  if (body.note !== undefined) {
    out.note = body.note == null ? null : String(body.note).trim().slice(0, 2000) || null;
  }

  return { ok: true, value: out };
}

/** CCs minus the (resolved) recipient — the server de-dupes it anyway; this
 *  keeps the stored draft honest when the recipient was defaulted. */
export function withoutRecipient(ccEmails: string[], recipient: string | null | undefined): string[] {
  const r = (recipient ?? "").trim().toLowerCase();
  return r ? ccEmails.filter((e) => e !== r) : ccEmails;
}
