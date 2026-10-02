import type { DealStatus } from "./deals";
import { parseServiceCategory, serializeServiceCategory } from "./serviceCategory";
import { addCc, isValidEmail } from "./invoice/email";
import { isRealYmd } from "./businessTime";

/**
 * The deal a draft proposes — same fields and rules as a deal created from
 * the closer portal (UnifiedDealForm → createDealAction), with v1's money
 * convention (dealValue in integer CENTS). Pure: no DB (existence of the
 * closer/setter is checked by the caller).
 */
export type SetterTierLetter = "A" | "B" | "C" | "D";

export interface DealDraftFields {
  closerId: string;
  clientName: string;
  dealValue: number;
  status: DealStatus;
  clientEmail: string | null;
  clientUserId: string | null;
  /** Serialized JSON array, same storage format as deals.service_category. */
  serviceCategory: string | null;
  industry: string | null;
  closingDate: string | null;
  notes: string | null;
  paymentType: "local" | "international";
  brandName: string | null;
  website: string | null;
  paidStatus: "paid" | "unpaid";
  additionalCcEmails: string[];
  setterId: string | null;
  setterTier: SetterTierLetter | null;
  noRetainer: boolean;
  googleEventId: string | null;
}

export const DEAL_DRAFT_STATUSES: DealStatus[] = [
  "closed",
  "not_closed",
  "pending_signature",
  "rescheduled",
  "follow_up",
];
const SETTER_TIERS: SetterTierLetter[] = ["A", "B", "C", "D"];
export const MAX_DEAL_VALUE_CENTS = 10_000_000 * 100;

export type FieldsResult = { ok: true; value: DealDraftFields } | { ok: false; error: string };

function text(raw: unknown, max: number): string | null {
  if (raw == null) return null;
  const v = String(raw).trim();
  return v ? v.slice(0, max) : null;
}

/**
 * Validate a create (no `base`) or a partial update (`base` = current fields;
 * only keys present in `body` change). Unknown keys are ignored.
 */
export function parseDealDraftFields(
  body: Record<string, unknown>,
  base?: DealDraftFields
): FieldsResult {
  const has = (k: string) => body[k] !== undefined;
  const f: DealDraftFields = base
    ? { ...base, additionalCcEmails: [...base.additionalCcEmails] }
    : {
        closerId: "",
        clientName: "",
        dealValue: 0,
        status: "closed",
        clientEmail: null,
        clientUserId: null,
        serviceCategory: null,
        industry: null,
        closingDate: null,
        notes: null,
        paymentType: "local",
        brandName: null,
        website: null,
        paidStatus: "unpaid",
        additionalCcEmails: [],
        setterId: null,
        setterTier: null,
        noRetainer: false,
        googleEventId: null,
      };

  if (has("closerId")) f.closerId = String(body.closerId ?? "").trim();
  if (has("clientName")) f.clientName = String(body.clientName ?? "").trim().slice(0, 200);
  if (!f.closerId) return { ok: false, error: "closerId is required" };
  if (!f.clientName) return { ok: false, error: "clientName is required" };

  if (has("status")) {
    const s = String(body.status) as DealStatus;
    if (!DEAL_DRAFT_STATUSES.includes(s)) return { ok: false, error: "Invalid status" };
    f.status = s;
  }
  if (has("dealValue")) {
    // typeof check: Number(null) / Number("") would silently read as 0.
    const v = body.dealValue;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > MAX_DEAL_VALUE_CENTS) {
      return { ok: false, error: "dealValue must be an integer amount in cents" };
    }
    f.dealValue = v;
  }
  // Same rule as the closer form: only a lost deal may carry no value.
  if (f.status !== "not_closed" && f.dealValue <= 0) {
    return { ok: false, error: "dealValue must be greater than 0 (cents) unless status is not_closed" };
  }

  if (has("clientEmail")) {
    const e = text(body.clientEmail, 254);
    if (e && !isValidEmail(e)) return { ok: false, error: "clientEmail is not a valid email" };
    f.clientEmail = e ? e.toLowerCase() : null;
  }
  if (has("clientUserId")) f.clientUserId = text(body.clientUserId, 100);
  if (has("serviceCategory")) {
    const raw = body.serviceCategory;
    const list = Array.isArray(raw)
      ? raw.map((s) => String(s ?? "").trim())
      : typeof raw === "string"
      ? parseServiceCategory(raw.trim() || null)
      : [];
    f.serviceCategory = serializeServiceCategory(list.filter(Boolean).slice(0, 20));
  }
  if (has("industry")) f.industry = text(body.industry, 100);
  if (has("closingDate")) {
    const d = text(body.closingDate, 10);
    if (d && !isRealYmd(d)) return { ok: false, error: "closingDate must be a real date (yyyy-mm-dd)" };
    f.closingDate = d;
  }
  if (has("notes")) f.notes = text(body.notes, 5000);
  if (has("paymentType")) {
    const p = String(body.paymentType ?? "local").trim() || "local";
    if (p !== "local" && p !== "international") {
      return { ok: false, error: "paymentType must be local or international" };
    }
    f.paymentType = p;
  }
  if (has("brandName")) f.brandName = text(body.brandName, 200);
  if (has("website")) f.website = text(body.website, 500);
  if (has("paidStatus")) {
    const p = String(body.paidStatus);
    if (p !== "paid" && p !== "unpaid") return { ok: false, error: "paidStatus must be paid or unpaid" };
    f.paidStatus = p;
  }
  if (has("additionalCcEmails")) {
    const raw = body.additionalCcEmails;
    if (raw !== null && !Array.isArray(raw)) return { ok: false, error: "additionalCcEmails must be an array" };
    let list: string[] = [];
    for (const addr of (raw as unknown[] | null) ?? []) {
      const res = addCc(list, String(addr ?? ""), { exclude: [f.clientEmail] });
      if (res.ok) list = res.list;
      else if (res.code !== "duplicate" && res.code !== "recipient") {
        return { ok: false, error: `additionalCcEmails: ${res.error}` };
      }
    }
    f.additionalCcEmails = list;
  }
  if (has("setterId")) f.setterId = text(body.setterId, 100);
  if (has("setterTier")) {
    const t = body.setterTier;
    if (t === null || t === "") f.setterTier = null;
    else if (SETTER_TIERS.includes(t as SetterTierLetter)) f.setterTier = t as SetterTierLetter;
    else return { ok: false, error: "setterTier must be A, B, C or D" };
  }
  if (has("noRetainer")) f.noRetainer = Boolean(body.noRetainer);
  if (has("googleEventId")) f.googleEventId = text(body.googleEventId, 300);

  return { ok: true, value: f };
}
