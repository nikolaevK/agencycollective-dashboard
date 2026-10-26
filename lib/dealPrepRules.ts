import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// Deal-prep agent — pure rules (no DB, no network; unit-tested).
//
// The agent pre-builds a closed deal's paperwork (draft invoices + per-deal
// DocuSeal scope clones) for an admin to review and send. These helpers own
// the decisions that must not drift between the routes: when a prep is stale,
// when a dispatched run is considered dead, what a scope edit may touch, how
// a template clone differs from its base, and which past deals are "similar".
// ---------------------------------------------------------------------------

export type DealPrepStatus =
  | "queued" // waiting for an agent run (dispatch pending, or a polling run picks it up)
  | "dispatched" // agent run started, no report yet
  | "ready" // agent finished — paperwork ready for review + send
  | "needs_input" // agent finished but flagged something it couldn't decide
  | "failed" // dispatch failed, or the run never reported back
  | "stale" // a person edited the paperwork — the agent keeps its hands off until a person asks for a re-run
  | "sent"; // the deal's invoice went out — terminal

export const DEAL_PREP_STATUSES: readonly DealPrepStatus[] = [
  "queued",
  "dispatched",
  "ready",
  "needs_input",
  "failed",
  "stale",
  "sent",
];

export function isDealPrepStatus(v: unknown): v is DealPrepStatus {
  return typeof v === "string" && (DEAL_PREP_STATUSES as readonly string[]).includes(v);
}

/** A dispatched run that hasn't reported back in this long is treated as dead. */
export const DEAL_PREP_STALL_MS = 45 * 60 * 1000;

/** The yyyy-mm-dd `days` before a yyyy-mm-dd (pure calendar math — pass a business-timezone date). */
export function ymdDaysBefore(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

/** SQLite `datetime('now')` stamps are zone-less UTC. */
export function parseDbTime(v: string | null | undefined): number {
  if (!v) return NaN;
  const iso = v.includes("T") ? v : `${v.replace(" ", "T")}Z`;
  return Date.parse(iso);
}

/** Status as shown to people: a dispatched run past the stall window is failed. */
export function effectiveDealPrepStatus(
  row: { status: DealPrepStatus; dispatchedAt: string | null },
  nowMs: number
): { status: DealPrepStatus; stalled: boolean } {
  if (row.status === "dispatched") {
    const at = parseDbTime(row.dispatchedAt);
    if (Number.isFinite(at) && nowMs - at > DEAL_PREP_STALL_MS) {
      return { status: "failed", stalled: true };
    }
  }
  return { status: row.status, stalled: false };
}

/**
 * The deal fields that shape the paperwork's CONTENT (lines, prices, scope
 * text). A change re-runs or stales the prep. Client name/email/brand are left
 * out on purpose: they're stamped at send time, and the closer route's email
 * sync touches the invoice row — which would otherwise read as a human edit.
 */
export interface DealPrepInputs {
  dealValue: number;
  serviceCategory: string | null;
  industry: string | null;
  notes: string | null;
  paymentType: string;
}

export function dealPrepInputHash(d: DealPrepInputs): string {
  const canonical = JSON.stringify([
    d.dealValue,
    d.serviceCategory ?? "",
    d.industry ?? "",
    (d.notes ?? "").trim(),
    d.paymentType,
  ]);
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

// ---------------------------------------------------------------------------
// DocuSeal template fields
// ---------------------------------------------------------------------------

export interface DsArea {
  x: number;
  y: number;
  w: number;
  h: number;
  page: number;
  attachment_uuid?: string;
  [k: string]: unknown;
}

export interface DsField {
  uuid: string;
  submitter_uuid?: string;
  name?: string | null;
  type: string;
  required?: boolean;
  readonly?: boolean;
  default_value?: unknown;
  preferences?: Record<string, unknown>;
  areas?: DsArea[];
  [k: string]: unknown;
}

/**
 * A DocuSeal template's fields plus the attachment uuid of each of its
 * documents, in order. A clone renews every uuid but keeps the order, so a
 * field's DOCUMENT INDEX (with its page) is what carries across clones.
 */
export interface DsTemplate {
  fields: DsField[];
  attachments: string[];
}

/** Text-like fields the agency pre-fills (read-only overlays on the PDF). */
const AGENCY_TYPES = new Set(["text", "number", "heading"]);
/** Signer fields an agent may REMOVE (e.g. initials/date on a dropped addendum) but never prefill. */
const REMOVABLE_SIGNER_TYPES = new Set(["initials", "date"]);

export function isAgencyField(f: DsField): boolean {
  return f.readonly === true && AGENCY_TYPES.has(f.type);
}

function firstArea(f: DsField): DsArea | null {
  const a = f.areas?.[0];
  return a && Number.isFinite(a.x) && Number.isFinite(a.y) ? a : null;
}

/** 0-based index of the document a field sits on (0 when unknown). */
export function fieldDocument(t: DsTemplate, f: DsField): number {
  const i = t.attachments.indexOf(firstArea(f)?.attachment_uuid ?? "");
  return i > 0 ? i : 0;
}

/** Position key — stable across clones (document index, page, x, y). Keys
 *  on the first document keep the plain `page:x:y` form. */
export function fieldPosKey(t: DsTemplate, f: DsField): string {
  const a = firstArea(f);
  if (!a) return `nopos:${f.uuid}`;
  const doc = fieldDocument(t, f);
  return `${doc > 0 ? `d${doc}:` : ""}${a.page}:${a.x.toFixed(2)}:${a.y.toFixed(2)}`;
}

function valueText(v: unknown): string {
  if (v == null) return "";
  return Array.isArray(v) ? v.join(", ") : String(v);
}

/**
 * Best-guess role of a field from its type and content, to orient the agent.
 * Exemplars (what admins actually edited) are the authority — this is a hint.
 */
export function fieldHint(f: DsField): string {
  if (!isAgencyField(f)) {
    if (f.type === "signature") return "client signature (never touch)";
    if (f.type === "initials") return "client initials";
    if (f.type === "date") return "client signing date";
    return "client-filled field (never prefill)";
  }
  const v = valueText(f.default_value).trim();
  if (!v) return "agency text (empty)";
  if (v.length > 60) return "clause text";
  if (/month/i.test(v)) return /\$|usd|\d{3,}/i.test(v) ? "monthly price" : "term length";
  if (/usd|\$/i.test(v)) return "money amount";
  const n = Number(v.replace(/[,%\s]/g, ""));
  if (Number.isFinite(n)) {
    if (/%/.test(v) || (n > 0 && n <= 100)) return "percentage (e.g. rev share)";
    return "amount (e.g. retainer or rev-share threshold)";
  }
  return "agency text";
}

export interface ScopeFieldView {
  uuid: string;
  type: string;
  /** 0-based document index (templates can hold several PDFs). */
  document: number;
  page: number | null;
  x: number | null;
  y: number | null;
  w: number | null;
  h: number | null;
  value: string;
  editable: boolean;
  removable: boolean;
  hint: string;
}

export function toScopeFieldView(t: DsTemplate, f: DsField): ScopeFieldView {
  const a = firstArea(f);
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return {
    uuid: f.uuid,
    type: f.type,
    document: fieldDocument(t, f),
    page: a ? a.page : null,
    x: a ? round(a.x) : null,
    y: a ? round(a.y) : null,
    w: a ? round(a.w) : null,
    h: a ? round(a.h) : null,
    value: isAgencyField(f) ? valueText(f.default_value) : "",
    editable: isAgencyField(f),
    removable: isAgencyField(f) || REMOVABLE_SIGNER_TYPES.has(f.type),
    hint: fieldHint(f),
  };
}

/** Comparator: reading order (document, page, then top-to-bottom, left-to-right). */
export function byReadingOrder(t: DsTemplate): (a: DsField, b: DsField) => number {
  return (a, b) => {
    const aa = firstArea(a);
    const bb = firstArea(b);
    if (!aa || !bb) return aa ? -1 : bb ? 1 : 0;
    return fieldDocument(t, a) - fieldDocument(t, b) || aa.page - bb.page || aa.y - bb.y || aa.x - bb.x;
  };
}

// ---------------------------------------------------------------------------
// Scope edits (the agent's equivalent of the builder)
// ---------------------------------------------------------------------------

export interface ScopeEdit {
  uuid: string;
  value: string;
  fontSize?: number;
}

export interface ScopeAdd {
  type: "text" | "initials" | "date";
  /** 0-based document index (default 0). */
  document?: number;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Required for text (a read-only agency clause/value); ignored for initials/date. */
  value?: string;
  fontSize?: number;
}

export interface ScopeOps {
  edits?: ScopeEdit[];
  remove?: string[];
  add?: ScopeAdd[];
}

export type RuleResult<T> = { ok: true; value: T } | { ok: false; error: string };

const MAX_VALUE = 5000;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fontSizeOf(raw: unknown, at: string): RuleResult<number | undefined> {
  if (raw === undefined || raw === null) return { ok: true, value: undefined };
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 6 || raw > 24) {
    return { ok: false, error: `${at}.fontSize must be an integer 6–24` };
  }
  return { ok: true, value: raw };
}

/** Validate an untrusted scope-ops body (shape only — field rules apply in applyScopeOps). */
export function parseScopeOps(raw: unknown): RuleResult<ScopeOps> {
  if (!isObj(raw)) return { ok: false, error: "Body must be an object" };
  const ops: ScopeOps = {};

  if (raw.edits !== undefined) {
    if (!Array.isArray(raw.edits) || raw.edits.length > 100) return { ok: false, error: "edits must be an array (max 100)" };
    ops.edits = [];
    for (let i = 0; i < raw.edits.length; i++) {
      const e = raw.edits[i];
      const at = `edits[${i}]`;
      if (!isObj(e) || typeof e.uuid !== "string" || !e.uuid) return { ok: false, error: `${at}.uuid is required` };
      if (typeof e.value !== "string" || e.value.length > MAX_VALUE) {
        return { ok: false, error: `${at}.value must be a string (max ${MAX_VALUE} characters)` };
      }
      const fs = fontSizeOf(e.fontSize, at);
      if (!fs.ok) return fs;
      ops.edits.push({ uuid: e.uuid, value: e.value, ...(fs.value ? { fontSize: fs.value } : {}) });
    }
  }

  if (raw.remove !== undefined) {
    if (!Array.isArray(raw.remove) || raw.remove.length > 100 || raw.remove.some((u) => typeof u !== "string" || !u)) {
      return { ok: false, error: "remove must be an array of field uuids (max 100)" };
    }
    ops.remove = raw.remove as string[];
  }

  if (raw.add !== undefined) {
    if (!Array.isArray(raw.add) || raw.add.length > 20) return { ok: false, error: "add must be an array (max 20)" };
    ops.add = [];
    for (let i = 0; i < raw.add.length; i++) {
      const a = raw.add[i];
      const at = `add[${i}]`;
      if (!isObj(a)) return { ok: false, error: `${at} must be an object` };
      if (a.type !== "text" && a.type !== "initials" && a.type !== "date") {
        return { ok: false, error: `${at}.type must be text, initials or date` };
      }
      const nums = ["x", "y", "w", "h"] as const;
      for (const k of nums) {
        const n = a[k];
        if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1) {
          return { ok: false, error: `${at}.${k} must be a fraction of the page (0–1)` };
        }
      }
      const x = a.x as number, y = a.y as number, w = a.w as number, h = a.h as number;
      if (w <= 0 || h <= 0 || x + w > 1.0001 || y + h > 1.0001) {
        return { ok: false, error: `${at} must lie inside the page (x+w ≤ 1, y+h ≤ 1, w/h > 0)` };
      }
      if (typeof a.page !== "number" || !Number.isInteger(a.page) || a.page < 0) {
        return { ok: false, error: `${at}.page must be a 0-based page index` };
      }
      if (a.document !== undefined && (typeof a.document !== "number" || !Number.isInteger(a.document) || a.document < 0)) {
        return { ok: false, error: `${at}.document must be a 0-based document index` };
      }
      let value: string | undefined;
      if (a.type === "text") {
        if (typeof a.value !== "string" || !a.value.trim() || a.value.length > MAX_VALUE) {
          return { ok: false, error: `${at}.value is required for a text field (max ${MAX_VALUE} characters)` };
        }
        value = a.value;
      }
      const fs = fontSizeOf(a.fontSize, at);
      if (!fs.ok) return fs;
      ops.add.push({
        type: a.type,
        ...(a.document !== undefined ? { document: a.document as number } : {}),
        page: a.page,
        x,
        y,
        w,
        h,
        ...(value !== undefined ? { value } : {}),
        ...(fs.value ? { fontSize: fs.value } : {}),
      });
    }
  }

  if (!ops.edits?.length && !ops.remove?.length && !ops.add?.length) {
    return { ok: false, error: "Provide at least one of edits, remove, add" };
  }
  return { ok: true, value: ops };
}

/**
 * Apply scope ops to a template's fields. Only agency (read-only text)
 * fields can be edited; agency fields plus signer initials/date can be
 * removed; signatures and client-filled fields are protected. Added text is
 * a read-only agency overlay, added initials/date belong to the signer.
 */
export function applyScopeOps(
  template: DsTemplate,
  submitterUuid: string,
  ops: ScopeOps,
  newUuid: () => string
): RuleResult<DsField[]> {
  const fields = template.fields;
  const byUuid = new Map(fields.map((f) => [f.uuid, f]));
  const removeSet = new Set(ops.remove ?? []);
  const editByUuid = new Map<string, ScopeEdit>();

  for (const e of ops.edits ?? []) {
    const f = byUuid.get(e.uuid);
    if (!f) return { ok: false, error: `No field with uuid ${e.uuid} on this scope` };
    if (!isAgencyField(f)) return { ok: false, error: `Field ${e.uuid} (${f.type}) is filled by the client — only read-only agency text can be edited` };
    if (removeSet.has(e.uuid)) return { ok: false, error: `Field ${e.uuid} is both edited and removed` };
    editByUuid.set(e.uuid, e);
  }
  for (const uuid of removeSet) {
    const f = byUuid.get(uuid);
    if (!f) return { ok: false, error: `No field with uuid ${uuid} on this scope` };
    if (!isAgencyField(f) && !REMOVABLE_SIGNER_TYPES.has(f.type)) {
      return { ok: false, error: `Field ${uuid} (${f.type}) can't be removed — signatures and client-filled fields are protected` };
    }
  }
  // DocuSeal doesn't report page counts — only the document index can be checked.
  for (const a of ops.add ?? []) {
    if (!template.attachments[a.document ?? 0]) {
      return { ok: false, error: `add: document ${a.document ?? 0} doesn't exist (this template has ${template.attachments.length}, 0-based)` };
    }
  }

  const next: DsField[] = [];
  for (const f of fields) {
    if (removeSet.has(f.uuid)) continue;
    const e = editByUuid.get(f.uuid);
    if (!e) {
      next.push(f);
      continue;
    }
    next.push({
      ...f,
      default_value: e.value,
      ...(e.fontSize ? { preferences: { ...(f.preferences ?? {}), font_size: e.fontSize } } : {}),
    });
  }
  for (const a of ops.add ?? []) {
    next.push({
      uuid: newUuid(),
      submitter_uuid: submitterUuid,
      name: "",
      type: a.type,
      required: a.type !== "text",
      readonly: a.type === "text",
      ...(a.type === "text" ? { default_value: a.value ?? "" } : {}),
      preferences: a.fontSize ? { font_size: a.fontSize } : {},
      areas: [{ x: a.x, y: a.y, w: a.w, h: a.h, page: a.page, attachment_uuid: template.attachments[a.document ?? 0] }],
    });
  }
  return { ok: true, value: next };
}

// ---------------------------------------------------------------------------
// Clone ↔ base diff (exemplars: what an admin changed for a deal)
// ---------------------------------------------------------------------------

export interface FieldChange {
  document: number;
  page: number | null;
  x: number | null;
  y: number | null;
  type: string;
  hint: string;
  from?: string;
  to?: string;
}

export interface TemplateDiff {
  edited: FieldChange[];
  removed: FieldChange[];
  added: FieldChange[];
}

function changeOf(t: DsTemplate, f: DsField, extra: Partial<FieldChange>): FieldChange {
  const v = toScopeFieldView(t, f);
  return { document: v.document, page: v.page, x: v.x, y: v.y, type: f.type, hint: v.hint, ...extra };
}

export const clip = (s: string, n = 600) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** JSON from a TEXT column; null when absent or corrupt. */
export function parseJson<T>(raw: unknown): T | null {
  if (raw == null) return null;
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return null;
  }
}

/** Position-matched diff of a per-deal clone against its base template. */
export function diffTemplateFields(base: DsTemplate, clone: DsTemplate): TemplateDiff {
  const remaining = new Map<string, DsField>();
  for (const f of base.fields) {
    const k = fieldPosKey(base, f);
    if (!remaining.has(k)) remaining.set(k, f);
  }
  const out: TemplateDiff = { edited: [], removed: [], added: [] };
  for (const f of [...clone.fields].sort(byReadingOrder(clone))) {
    const k = fieldPosKey(clone, f);
    const b = remaining.get(k);
    if (!b || b.type !== f.type) {
      out.added.push(changeOf(clone, f, isAgencyField(f) ? { to: clip(valueText(f.default_value)) } : {}));
      continue;
    }
    remaining.delete(k);
    const from = valueText(b.default_value);
    const to = valueText(f.default_value);
    if (isAgencyField(f) && from !== to) out.edited.push(changeOf(base, b, { from: clip(from), to: clip(to) }));
  }
  for (const b of [...remaining.values()].sort(byReadingOrder(base))) {
    out.removed.push(changeOf(base, b, isAgencyField(b) ? { from: clip(valueText(b.default_value), 120) } : {}));
  }
  return out;
}

export function isEmptyDiff(d: TemplateDiff): boolean {
  return d.edited.length === 0 && d.removed.length === 0 && d.added.length === 0;
}

// ---------------------------------------------------------------------------
// Paperwork snapshots + corrections (what the agent prepared vs what went out)
// ---------------------------------------------------------------------------

export interface SnapshotInvoiceItem {
  name: string;
  quantity: number;
  unitPriceCents: number;
}

export interface SnapshotInvoice {
  kind: "primary" | "additional";
  id: string;
  number: string;
  status: string;
  invoiceDate: string;
  dueDate: string;
  terms: string;
  paymentTerms: string;
  notes: string;
  discount: { type: "amount" | "percentage"; value: number } | null;
  items: SnapshotInvoiceItem[];
  totalCents: number;
}

export interface SnapshotContract {
  kind: "primary" | "additional";
  id: string;
  status: string;
  templateId: string | null;
  templateName: string | null;
  /** The per-deal clone's agency values + signer initials/date, keyed by position. */
  fields: Record<string, { type: string; value: string }>;
  changesFromBase: TemplateDiff | null;
  documentNames: string[];
  /** A DocuSeal read failed — fields/changes are UNKNOWN, not empty. */
  unreadable?: boolean;
}

export interface PaperworkSnapshot {
  invoices: SnapshotInvoice[];
  contracts: SnapshotContract[];
}

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

function itemsLabel(items: SnapshotInvoiceItem[]): string {
  return items.map((i) => `${i.quantity !== 1 ? `${i.quantity}× ` : ""}${i.name} ${money(i.unitPriceCents)}`).join(" + ") || "(no lines)";
}

/**
 * Human-readable corrections a person made to the agent's prepared paperwork
 * before sending — the "lessons" fed back into future runs. Invoices are
 * matched by id, contracts by id; fields by position.
 */
export function diffPaperwork(prepared: PaperworkSnapshot, sent: PaperworkSnapshot): string[] {
  const out: string[] = [];
  const label = (kind: string, n: number) => (kind === "primary" ? "primary" : `additional #${n}`);

  const prepInv = new Map(prepared.invoices.map((i) => [i.id, i]));
  let addN = 0;
  for (const s of sent.invoices) {
    if (s.kind === "additional") addN++;
    const name = `Invoice ${label(s.kind, addN)}`;
    const p = prepInv.get(s.id);
    prepInv.delete(s.id);
    if (!p) {
      out.push(`${name} was added by the reviewer: ${itemsLabel(s.items)}`);
      continue;
    }
    if (itemsLabel(p.items) !== itemsLabel(s.items)) {
      out.push(`${name} lines changed: ${itemsLabel(p.items)} → ${itemsLabel(s.items)}`);
    }
    if (JSON.stringify(p.discount) !== JSON.stringify(s.discount)) {
      out.push(`${name} discount changed: ${JSON.stringify(p.discount)} → ${JSON.stringify(s.discount)}`);
    }
    if (p.dueDate !== s.dueDate) out.push(`${name} due date changed: ${p.dueDate || "(none)"} → ${s.dueDate || "(none)"}`);
    for (const k of ["terms", "paymentTerms", "notes"] as const) {
      if ((p[k] || "") !== (s[k] || "")) out.push(`${name} ${k} changed: "${clip(p[k] || "", 160)}" → "${clip(s[k] || "", 160)}"`);
    }
  }
  for (const p of prepInv.values()) out.push(`Invoice ${p.number} prepared by the agent was dropped (deleted or not sent): ${itemsLabel(p.items)}`);

  const prepCtr = new Map(prepared.contracts.map((c) => [c.id, c]));
  let ctrN = 0;
  for (const s of sent.contracts) {
    if (s.kind === "additional") ctrN++;
    const name = `Contract ${label(s.kind, ctrN)}`;
    const p = prepCtr.get(s.id);
    prepCtr.delete(s.id);
    if (!p) {
      out.push(`${name} was added by the reviewer (template "${s.templateName ?? "?"}")`);
      continue;
    }
    if (p.templateId !== s.templateId) {
      out.push(`${name} template changed: "${p.templateName ?? "none"}" → "${s.templateName ?? "none"}"`);
      continue; // field positions aren't comparable across templates
    }
    if (p.unreadable || s.unreadable) continue; // unknown fields teach nothing
    const keys = new Set([...Object.keys(p.fields), ...Object.keys(s.fields)]);
    for (const k of keys) {
      const a = p.fields[k];
      const b = s.fields[k];
      if (a && !b) out.push(`${name} field @${k} (${a.type}${a.value ? ` "${clip(a.value, 120)}"` : ""}) was removed`);
      else if (!a && b) out.push(`${name} field @${k} (${b.type}${b.value ? ` "${clip(b.value, 160)}"` : ""}) was added`);
      else if (a && b && a.value !== b.value) out.push(`${name} field @${k} changed: "${clip(a.value, 160)}" → "${clip(b.value, 160)}"`);
    }
  }
  for (const p of prepCtr.values()) out.push(`Contract prepared by the agent (template "${p.templateName ?? "?"}") was dropped (deleted or not sent)`);
  return out;
}

// ---------------------------------------------------------------------------
// A person's edits (the agent never overwrites them)
// ---------------------------------------------------------------------------

/**
 * Whether the paperwork differs from what the agent left (its submit
 * snapshot). Compared by CONTENT, so system writes such as the invoice email
 * sync don't count, while DocuSeal builder edits and deletions do. A template
 * that couldn't be read counts as changed — never guess in the agent's favor.
 */
export function paperworkChanged(prepared: PaperworkSnapshot, current: PaperworkSnapshot): boolean {
  if ([...prepared.contracts, ...current.contracts].some((c) => c.unreadable)) return true;
  return diffPaperwork(prepared, current).length > 0;
}

/** System writes that finish generating paperwork (e.g. an approved draft's invoice spec) land within this of creation. */
export const PAPERWORK_GENERATION_GRACE_MS = 2 * 60 * 1000;

export interface PaperworkRecordMeta {
  kind: "primary" | "additional";
  createdAt: string;
  updatedAt: string;
  /** Contracts: carries a per-deal DocuSeal copy. */
  customized?: boolean;
}

/**
 * Paperwork the agent never prepared is fair game only while it is exactly
 * what deal creation generated: primary invoice + primary contract, not
 * edited after the grace window, no per-deal contract copy, nothing extra.
 * Unparseable timestamps count as edited.
 */
export function isGeneratedPaperwork(records: PaperworkRecordMeta[]): boolean {
  return records.every(
    (r) =>
      r.kind === "primary" &&
      !r.customized &&
      parseDbTime(r.updatedAt) - parseDbTime(r.createdAt) <= PAPERWORK_GENERATION_GRACE_MS
  );
}

// ---------------------------------------------------------------------------
// Exemplar similarity (which past deals to show the agent)
// ---------------------------------------------------------------------------

const STOP = new Set([
  "the", "and", "for", "with", "client", "clients", "his", "her", "their", "they", "has", "have", "had", "that",
  "this", "was", "are", "but", "not", "from", "will", "would", "about", "also", "into", "just", "been", "she",
  "him", "them", "very", "send", "please", "who", "what", "when", "our", "out", "can", "get", "all", "one",
]);
const KEYWORDS = new Set([
  "q4", "agency", "account", "tiktok", "email", "emails", "google", "creative", "creatives", "ads", "meta", "rev",
  "share", "threshold", "telehealth", "ruo", "waive", "waived", "discount", "split", "payments", "months", "month",
  "package", "consulting", "launch", "web", "website", "sms", "retainer", "performance",
]);

/** Normalized tokens with weights: money/percent amounts weigh most, domain keywords next. */
export function noteTokens(text: string): Map<string, number> {
  const out = new Map<string, number>();
  const t = text.toLowerCase();
  for (const m of t.matchAll(/\$?\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(k\b|%)?/g)) {
    let n = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    if (m[2] === "%") {
      out.set(`${n}%`, 3);
      continue;
    }
    if (m[2] === "k") n *= 1000;
    if (n >= 100) out.set(`$${Math.round(n)}`, 3);
  }
  for (const w of t.split(/[^a-z0-9]+/)) {
    if (w.length < 2 || STOP.has(w) || /^\d+$/.test(w)) continue;
    if (KEYWORDS.has(w)) out.set(w.replace(/s$/, ""), 2);
    else if (w.length >= 4 && !out.has(w)) out.set(w, 1);
  }
  return out;
}

export interface ExemplarSignal {
  notes: string | null;
  serviceCategory: string | null;
  industry: string | null;
  dealValue: number;
}

/** Cosine-like weighted overlap + small bonuses for same industry/services/value. */
export function exemplarScore(target: ExemplarSignal, ex: ExemplarSignal): number {
  const a = noteTokens(`${target.notes ?? ""} ${target.serviceCategory ?? ""}`);
  const b = noteTokens(`${ex.notes ?? ""} ${ex.serviceCategory ?? ""}`);
  let inter = 0;
  let wa = 0;
  let wb = 0;
  for (const w of a.values()) wa += w;
  for (const w of b.values()) wb += w;
  for (const [k, w] of a) if (b.has(k)) inter += Math.min(w, b.get(k)!);
  let score = wa > 0 && wb > 0 ? inter / Math.sqrt(wa * wb) : 0;
  if (target.industry && ex.industry && target.industry.toLowerCase() === ex.industry.toLowerCase()) score += 0.1;
  if (target.serviceCategory && target.serviceCategory === ex.serviceCategory) score += 0.1;
  if (target.dealValue > 0 && target.dealValue === ex.dealValue) score += 0.1;
  return score;
}
