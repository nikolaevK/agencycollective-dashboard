import { getDb, ensureMigrated } from "./db";
import { DEFAULT_WELCOME_KIT } from "./welcomeKitDefault";

// ---------------------------------------------------------------------------
// Types — the Welcome Kit is a single global document of structured "blocks"
// rendered into the portal design system. Persisted as one JSON row.
// ---------------------------------------------------------------------------

export type WkVariant = "info" | "success" | "warning" | "danger" | "neutral";
export type WkMarker = "check" | "dot";
export type WkCardsLayout = "grid" | "list";
export type WkBlockType =
  | "text"
  | "callout"
  | "stat"
  | "checklist"
  | "cards"
  | "columns"
  | "rows";

export interface WkTextBlock {
  id: string;
  type: "text";
  body: string; // markdown
}

export interface WkCalloutBlock {
  id: string;
  type: "callout";
  variant: WkVariant;
  icon?: string;
  title?: string;
  body: string; // markdown
}

export interface WkStatBlock {
  id: string;
  type: "stat";
  value: string;
  label: string;
  caption?: string;
}

export interface WkChecklistBlock {
  id: string;
  type: "checklist";
  title?: string;
  note?: string;
  marker: WkMarker;
  items: string[];
}

export interface WkCardItem {
  id: string;
  icon?: string;
  label: string;
  desc?: string;
}

export interface WkCardsBlock {
  id: string;
  type: "cards";
  layout: WkCardsLayout;
  columns: 1 | 2 | 3 | 4;
  items: WkCardItem[];
}

export interface WkColumnItem {
  id: string;
  icon?: string;
  title: string;
  badge?: string;
  body?: string;
  bullets: string[];
}

export interface WkColumnsBlock {
  id: string;
  type: "columns";
  items: WkColumnItem[];
}

export interface WkRowItem {
  id: string;
  label: string;
  value?: string;
}

export interface WkRowsBlock {
  id: string;
  type: "rows";
  title?: string;
  rows: WkRowItem[];
}

export type WkBlock =
  | WkTextBlock
  | WkCalloutBlock
  | WkStatBlock
  | WkChecklistBlock
  | WkCardsBlock
  | WkColumnsBlock
  | WkRowsBlock;

export interface WkSection {
  id: string;
  num: string; // "01 / Communication"
  icon: string;
  title: string; // "How We Connect"
  blocks: WkBlock[];
}

export interface WkHero {
  badge: string;
  titleLead: string;
  titleHighlight: string;
  titleTail: string;
  subtitle: string;
}

export interface WkCta {
  enabled: boolean;
  title: string;
  body: string;
  buttonLabel: string;
  buttonUrl: string; // portal falls back to the onboarding page when empty
  showPdf: boolean;
  pdfUrl: string;
}

export interface WelcomeKitDoc {
  hero: WkHero;
  sections: WkSection[];
  cta: WkCta;
}

/** Metadata for the uploaded downloadable PDF (the blob itself lives in the DB). */
export interface WelcomeKitPdfMeta {
  name: string;
  size: number;
  uploadedAt: string | null;
}

export interface WelcomeKitRecord {
  doc: WelcomeKitDoc;
  shareEnabled: boolean;
  updatedAt: string | null;
  /** Present when an admin has uploaded a PDF; null when only a URL (or none). */
  pdf: WelcomeKitPdfMeta | null;
}

/** Public path that streams the uploaded Welcome Kit PDF (see app/welcome-kit/pdf). */
export const PDF_SERVE_PATH = "/welcome-kit/pdf";

/** Max upload size for the Welcome Kit PDF (matches payout documents). */
export const MAX_WELCOME_KIT_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

// ---------------------------------------------------------------------------
// Normalization / validation (manual, per repo convention — Zod is reserved
// for Meta API responses). Defends the renderer + DB against malformed input
// and older saved shapes: clamps lengths, ensures ids, coerces enums, drops
// unknown block types.
// ---------------------------------------------------------------------------

const SINGLETON_ID = "default";

const LIMITS = {
  sections: 40,
  blocks: 60,
  items: 60,
  short: 240,
  body: 6000,
};

function str(v: unknown, max = LIMITS.short): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function normIcon(v: unknown): string | undefined {
  const k = typeof v === "string" ? v.slice(0, 40) : "";
  return k || undefined;
}

const VARIANTS: WkVariant[] = ["info", "success", "warning", "danger", "neutral"];

function normBlock(raw: unknown): WkBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id, 60) || uid("blk");

  switch (r.type) {
    case "text":
      return { id, type: "text", body: str(r.body, LIMITS.body) };

    case "callout": {
      const variant = VARIANTS.includes(r.variant as WkVariant)
        ? (r.variant as WkVariant)
        : "info";
      return {
        id,
        type: "callout",
        variant,
        icon: normIcon(r.icon),
        title: str(r.title) || undefined,
        body: str(r.body, LIMITS.body),
      };
    }

    case "stat":
      return {
        id,
        type: "stat",
        value: str(r.value, 40),
        label: str(r.label),
        caption: str(r.caption, 400) || undefined,
      };

    case "checklist": {
      const items = arr(r.items)
        .map((i) => str(i, 400))
        .filter(Boolean)
        .slice(0, LIMITS.items);
      return {
        id,
        type: "checklist",
        title: str(r.title) || undefined,
        note: str(r.note, 600) || undefined,
        marker: r.marker === "dot" ? "dot" : "check",
        items,
      };
    }

    case "cards": {
      const columns = ([1, 2, 3, 4] as const).includes(Number(r.columns) as 1 | 2 | 3 | 4)
        ? (Number(r.columns) as 1 | 2 | 3 | 4)
        : 3;
      const items = arr(r.items)
        .slice(0, LIMITS.items)
        .map((it) => {
          const o = (it ?? {}) as Record<string, unknown>;
          return {
            id: str(o.id, 60) || uid("card"),
            icon: normIcon(o.icon),
            label: str(o.label),
            desc: str(o.desc, 400) || undefined,
          };
        })
        .filter((it) => it.label || it.desc);
      return {
        id,
        type: "cards",
        layout: r.layout === "list" ? "list" : "grid",
        columns,
        items,
      };
    }

    case "columns": {
      // Cap at 3 — the renderer lays columns out 1–3 wide; a 4th would wrap
      // onto a new row, so keep the model and the renderer in agreement.
      const items = arr(r.items)
        .slice(0, 3)
        .map((it) => {
          const o = (it ?? {}) as Record<string, unknown>;
          return {
            id: str(o.id, 60) || uid("col"),
            icon: normIcon(o.icon),
            title: str(o.title),
            badge: str(o.badge) || undefined,
            body: str(o.body, 800) || undefined,
            bullets: arr(o.bullets)
              .map((b) => str(b, 300))
              .filter(Boolean)
              .slice(0, 20),
          };
        });
      return { id, type: "columns", items };
    }

    case "rows": {
      const rows = arr(r.rows)
        .slice(0, LIMITS.items)
        .map((it) => {
          const o = (it ?? {}) as Record<string, unknown>;
          return {
            id: str(o.id, 60) || uid("row"),
            label: str(o.label),
            value: str(o.value) || undefined,
          };
        })
        .filter((it) => it.label);
      return { id, type: "rows", title: str(r.title) || undefined, rows };
    }

    default:
      return null;
  }
}

export function normalizeDoc(raw: unknown): WelcomeKitDoc {
  const base = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const hero = (base.hero && typeof base.hero === "object" ? base.hero : {}) as Record<string, unknown>;
  const cta = (base.cta && typeof base.cta === "object" ? base.cta : {}) as Record<string, unknown>;

  const sections = arr(base.sections)
    .slice(0, LIMITS.sections)
    .map((sec) => {
      const o = (sec ?? {}) as Record<string, unknown>;
      const blocks = arr(o.blocks)
        .slice(0, LIMITS.blocks)
        .map(normBlock)
        .filter((b): b is WkBlock => b !== null);
      return {
        id: str(o.id, 60) || uid("sec"),
        num: str(o.num, 60),
        icon: normIcon(o.icon) || "star",
        title: str(o.title),
        blocks,
      };
    });

  return {
    hero: {
      badge: str(hero.badge),
      titleLead: str(hero.titleLead),
      titleHighlight: str(hero.titleHighlight),
      titleTail: str(hero.titleTail),
      subtitle: str(hero.subtitle, 600),
    },
    sections,
    cta: {
      enabled: cta.enabled !== false,
      title: str(cta.title),
      body: str(cta.body, 800),
      buttonLabel: str(cta.buttonLabel, 80),
      buttonUrl: str(cta.buttonUrl, 500),
      showPdf: Boolean(cta.showPdf),
      pdfUrl: str(cta.pdfUrl, 500),
    },
  };
}

// ---------------------------------------------------------------------------
// Persistence — single global row (id = 'default'). Absent row = use defaults.
// ---------------------------------------------------------------------------

function parseDoc(raw: unknown): WelcomeKitDoc {
  try {
    return normalizeDoc(JSON.parse(String(raw)));
  } catch {
    return DEFAULT_WELCOME_KIT;
  }
}

function blobToBuffer(raw: unknown): Buffer | null {
  if (raw == null) return null;
  if (raw instanceof ArrayBuffer) return Buffer.from(raw);
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  if (typeof raw === "string") return Buffer.from(raw, "base64");
  return null;
}

function rowToPdfMeta(row: Record<string, unknown>): WelcomeKitPdfMeta | null {
  if (row.pdf_name == null) return null;
  return {
    name: String(row.pdf_name),
    size: Number(row.pdf_size ?? 0),
    uploadedAt: row.pdf_uploaded_at != null ? String(row.pdf_uploaded_at) : null,
  };
}

/**
 * When a PDF has been uploaded it takes precedence over the typed `cta.pdfUrl`:
 * point the download link at the public serve route. Used by the consumer
 * surfaces (portal + public) and mirrored by the builder preview.
 */
function withUploadedPdf(doc: WelcomeKitDoc, hasPdf: boolean): WelcomeKitDoc {
  if (!hasPdf) return doc;
  return { ...doc, cta: { ...doc.cta, pdfUrl: PDF_SERVE_PATH } };
}

/**
 * Full record for the builder: the RAW saved doc (no PDF injection so the
 * admin edits the real stored URL) plus separate PDF metadata. Falls back to
 * the in-code default kit.
 */
export async function getWelcomeKitRecord(): Promise<WelcomeKitRecord> {
  await ensureMigrated();
  const db = getDb();
  const res = await db.execute({
    sql: "SELECT doc, share_enabled, updated_at, pdf_name, pdf_size, pdf_uploaded_at FROM welcome_kit WHERE id = ?",
    args: [SINGLETON_ID],
  });
  const row = res.rows[0];
  if (!row)
    return { doc: DEFAULT_WELCOME_KIT, shareEnabled: false, updatedAt: null, pdf: null };
  return {
    doc: parseDoc(row.doc),
    shareEnabled: Number(row.share_enabled ?? 0) === 1,
    updatedAt: row.updated_at != null ? String(row.updated_at) : null,
    pdf: rowToPdfMeta(row),
  };
}

/**
 * The kit document, saved-or-default, with the uploaded PDF applied. Used by
 * the client portal page (so an uploaded file is the live download).
 */
export async function getWelcomeKitDoc(): Promise<WelcomeKitDoc> {
  const record = await getWelcomeKitRecord();
  return withUploadedPdf(record.doc, record.pdf !== null);
}

/** The doc ONLY when publicly published; otherwise null. Used by /welcome-kit. */
export async function getPublishedWelcomeKit(): Promise<WelcomeKitDoc | null> {
  await ensureMigrated();
  const db = getDb();
  const res = await db.execute({
    sql: "SELECT doc, share_enabled, pdf_name FROM welcome_kit WHERE id = ?",
    args: [SINGLETON_ID],
  });
  const row = res.rows[0];
  if (!row || Number(row.share_enabled ?? 0) !== 1) return null;
  return withUploadedPdf(parseDoc(row.doc), row.pdf_name != null);
}

/**
 * Thrown by {@link saveWelcomeKitDoc} when the row was modified by someone else
 * since the editor loaded it (optimistic-concurrency check). Carries the
 * current server `updated_at` so the caller can offer reload/overwrite.
 */
export class WelcomeKitConflictError extends Error {
  currentUpdatedAt: string | null;
  constructor(currentUpdatedAt: string | null) {
    super("Welcome Kit was modified by someone else");
    this.name = "WelcomeKitConflictError";
    this.currentUpdatedAt = currentUpdatedAt;
  }
}

/**
 * Validate + upsert the document, preserving the share flag. Returns the new
 * `updatedAt`. Pass `expectedUpdatedAt` (the value the editor loaded, or `null`
 * if it loaded the in-code default) to enable an optimistic-concurrency check —
 * a mismatch throws {@link WelcomeKitConflictError} instead of clobbering.
 */
export async function saveWelcomeKitDoc(
  rawDoc: unknown,
  updatedBy?: string | null,
  expectedUpdatedAt?: string | null
): Promise<{ doc: WelcomeKitDoc; updatedAt: string }> {
  await ensureMigrated();
  const db = getDb();
  const doc = normalizeDoc(rawDoc);
  const now = new Date().toISOString();

  if (expectedUpdatedAt !== undefined) {
    const existing = await db.execute({
      sql: "SELECT updated_at FROM welcome_kit WHERE id = ?",
      args: [SINGLETON_ID],
    });
    const currentUpdatedAt =
      existing.rows[0]?.updated_at != null ? String(existing.rows[0].updated_at) : null;
    if (currentUpdatedAt !== (expectedUpdatedAt ?? null)) {
      throw new WelcomeKitConflictError(currentUpdatedAt);
    }
  }

  await db.execute({
    sql: `INSERT INTO welcome_kit (id, doc, share_enabled, updated_at, updated_by)
          VALUES (?, ?, 0, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            doc = excluded.doc,
            updated_at = excluded.updated_at,
            updated_by = excluded.updated_by`,
    args: [SINGLETON_ID, JSON.stringify(doc), now, updatedBy ?? null],
  });
  return { doc, updatedAt: now };
}

/** Toggle public sharing, preserving the document (seeds default if absent). */
export async function setWelcomeKitShare(
  enabled: boolean,
  updatedBy?: string | null
): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO welcome_kit (id, doc, share_enabled, updated_at, updated_by)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            share_enabled = excluded.share_enabled,
            updated_at = excluded.updated_at,
            updated_by = excluded.updated_by`,
    args: [SINGLETON_ID, JSON.stringify(DEFAULT_WELCOME_KIT), enabled ? 1 : 0, now, updatedBy ?? null],
  });
}

// ---------------------------------------------------------------------------
// Downloadable PDF — stored as a BLOB on the same singleton row (matches the
// payout-documents pattern; Vercel's filesystem is read-only at runtime).
// PDF writes deliberately do NOT touch `updated_at` (the doc concurrency
// token), so uploading/removing a file never triggers a false save conflict.
// ---------------------------------------------------------------------------

/** Store (or replace) the uploaded PDF. Seeds the default doc if no row yet. */
export async function setWelcomeKitPdf(
  fileData: Buffer,
  name: string,
  size: number
): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  const safeName = name.slice(0, 240) || "welcome-kit.pdf";
  await db.execute({
    sql: `INSERT INTO welcome_kit (id, doc, share_enabled, pdf_data, pdf_name, pdf_size, pdf_uploaded_at)
          VALUES (?, ?, 0, ?, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            pdf_data = excluded.pdf_data,
            pdf_name = excluded.pdf_name,
            pdf_size = excluded.pdf_size,
            pdf_uploaded_at = excluded.pdf_uploaded_at`,
    args: [SINGLETON_ID, JSON.stringify(DEFAULT_WELCOME_KIT), fileData, safeName, size],
  });
}

/** Remove the uploaded PDF (no-op if none / no row). Leaves the doc untouched. */
export async function clearWelcomeKitPdf(): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: `UPDATE welcome_kit
          SET pdf_data = NULL, pdf_name = NULL, pdf_size = NULL, pdf_uploaded_at = NULL
          WHERE id = ?`,
    args: [SINGLETON_ID],
  });
}

/** The PDF bytes + filename for the public serve route; null when none. */
export async function getWelcomeKitPdf(): Promise<{ data: Buffer; name: string } | null> {
  await ensureMigrated();
  const db = getDb();
  const res = await db.execute({
    sql: "SELECT pdf_data, pdf_name FROM welcome_kit WHERE id = ?",
    args: [SINGLETON_ID],
  });
  const row = res.rows[0];
  if (!row || row.pdf_name == null) return null;
  const data = blobToBuffer(row.pdf_data);
  if (!data) return null;
  return { data, name: String(row.pdf_name) };
}
