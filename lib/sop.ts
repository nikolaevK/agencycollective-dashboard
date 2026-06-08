import crypto from "crypto";
import { getDb, ensureMigrated } from "./db";
import type {
  WkBlock,
  WkVariant,
} from "./welcomeKit";

// ---------------------------------------------------------------------------
// SOP Builder — Standard Operating Procedures.
//
// A SOP is a structured "block" document (the same block model the Welcome Kit
// uses, extended with a `steps` block for numbered procedures) rendered into
// our design system. Unlike the singleton Welcome Kit there are MANY SOPs, each
// organized into a folder (department) with tags. Persisted one JSON row per
// SOP. See lib/welcomeKit.ts for the shared block types and the normalization
// approach this mirrors (manual, per repo convention — Zod is reserved for the
// Meta API).
// ---------------------------------------------------------------------------

/** A single numbered/bulleted step within a `steps` block. */
export interface SopStep {
  id: string;
  text: string;
  detail?: string;
}

/** SOP-specific block: an ordered (or unordered) procedure list. */
export interface SopStepsBlock {
  id: string;
  type: "steps";
  title?: string;
  ordered: boolean;
  steps: SopStep[];
}

/** The block union for SOPs = all Welcome Kit blocks + the steps block. */
export type SopBlock = WkBlock | SopStepsBlock;
export type SopBlockType = SopBlock["type"];

export interface SopSection {
  id: string;
  num: string; // eyebrow, e.g. "01 / Purpose"
  icon: string;
  title: string;
  blocks: SopBlock[];
}

/** The rendered document — self-contained so the renderer/PDF are pure. */
export interface SopDoc {
  title: string;
  summary: string;
  sections: SopSection[];
}

export type SopStatus = "draft" | "published";

/** Lightweight row for the library list (no `doc` payload). */
export interface SopListItem {
  id: string;
  title: string;
  description: string;
  folder: string;
  tags: string[];
  status: SopStatus;
  updatedAt: string;
  createdAt: string;
}

/** Full record for the builder. */
export interface SopRecord {
  id: string;
  title: string;
  description: string;
  folder: string;
  tags: string[];
  status: SopStatus;
  doc: SopDoc;
  updatedAt: string;
  createdAt: string;
}

export const DEFAULT_SOP_FOLDER = "General";
export const MAX_SOP_TAGS = 12;

// ---------------------------------------------------------------------------
// Normalization / validation (manual). Defends the renderer + DB against
// malformed input (incl. Claude-generated / imported JSON) and older saved
// shapes: clamps lengths, ensures ids, coerces enums, drops unknown blocks.
// ---------------------------------------------------------------------------

const LIMITS = {
  sections: 60,
  blocks: 80,
  items: 80,
  short: 240,
  body: 8000,
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

function normBlock(raw: unknown): SopBlock | null {
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

    case "steps": {
      const steps = arr(r.steps)
        .slice(0, LIMITS.items)
        .map((it) => {
          const o = (it ?? {}) as Record<string, unknown>;
          return {
            id: str(o.id, 60) || uid("step"),
            text: str(o.text, LIMITS.body),
            detail: str(o.detail, LIMITS.body) || undefined,
          };
        })
        .filter((s) => s.text || s.detail);
      return {
        id,
        type: "steps",
        title: str(r.title) || undefined,
        ordered: r.ordered !== false,
        steps,
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

export function normalizeSopDoc(raw: unknown): SopDoc {
  const base = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const sections = arr(base.sections)
    .slice(0, LIMITS.sections)
    .map((sec) => {
      const o = (sec ?? {}) as Record<string, unknown>;
      const blocks = arr(o.blocks)
        .slice(0, LIMITS.blocks)
        .map(normBlock)
        .filter((b): b is SopBlock => b !== null);
      return {
        id: str(o.id, 60) || uid("sec"),
        num: str(o.num, 60),
        icon: normIcon(o.icon) || "file",
        title: str(o.title),
        blocks,
      };
    });

  return {
    title: str(base.title) || "Untitled SOP",
    summary: str(base.summary, 1200),
    sections,
  };
}

export function normalizeTags(raw: unknown): string[] {
  return arr(raw)
    .map((t) => str(t, 40).trim())
    .filter(Boolean)
    .slice(0, MAX_SOP_TAGS);
}

/** A blank starter document for a new SOP. */
export function defaultSopDoc(title = "New SOP"): SopDoc {
  return {
    title,
    summary: "",
    sections: [
      {
        id: uid("sec"),
        num: "01 / Purpose",
        icon: "target",
        title: "Purpose & Scope",
        blocks: [{ id: uid("blk"), type: "text", body: "" }],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function parseTags(raw: unknown): string[] {
  try {
    return normalizeTags(JSON.parse(String(raw ?? "[]")));
  } catch {
    return [];
  }
}

function parseDoc(raw: unknown): SopDoc {
  try {
    return normalizeSopDoc(JSON.parse(String(raw)));
  } catch {
    return defaultSopDoc();
  }
}

function normStatus(v: unknown): SopStatus {
  return v === "published" ? "published" : "draft";
}

const LIST_COLUMNS = "id, title, description, folder, tags, status, updated_at, created_at";

function rowToListItem(row: Record<string, unknown>): SopListItem {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    description: row.description != null ? String(row.description) : "",
    folder: String(row.folder ?? DEFAULT_SOP_FOLDER),
    tags: parseTags(row.tags),
    status: normStatus(row.status),
    updatedAt: String(row.updated_at ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

/** List SOPs (metadata only), optionally filtered by folder and/or tag. */
export async function listSops(opts?: { folder?: string; tag?: string }): Promise<SopListItem[]> {
  await ensureMigrated();
  const db = getDb();
  const where: string[] = [];
  const args: string[] = [];
  if (opts?.folder) {
    where.push("folder = ?");
    args.push(opts.folder);
  }
  const res = await db.execute({
    sql: `SELECT ${LIST_COLUMNS} FROM sops${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY updated_at DESC`,
    args,
  });
  let items = res.rows.map(rowToListItem);
  // Tag filter applied in-memory (tags are a JSON column).
  if (opts?.tag) {
    const t = opts.tag.toLowerCase();
    items = items.filter((s) => s.tags.some((x) => x.toLowerCase() === t));
  }
  return items;
}

/** Every distinct tag in use (for filter chips), sorted. */
export async function listAllTags(): Promise<string[]> {
  await ensureMigrated();
  const db = getDb();
  const res = await db.execute("SELECT tags FROM sops");
  const set = new Set<string>();
  for (const row of res.rows) parseTags(row.tags).forEach((t) => set.add(t));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export async function getSop(id: string): Promise<SopRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const res = await db.execute({
    sql: "SELECT id, title, description, folder, tags, status, doc, updated_at, created_at FROM sops WHERE id = ?",
    args: [id],
  });
  const row = res.rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    description: row.description != null ? String(row.description) : "",
    folder: String(row.folder ?? DEFAULT_SOP_FOLDER),
    tags: parseTags(row.tags),
    status: normStatus(row.status),
    doc: parseDoc(row.doc),
    updatedAt: String(row.updated_at ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

export interface CreateSopInput {
  rawDoc: unknown;
  folder?: string;
  tags?: unknown;
  status?: unknown;
}

export async function createSop(
  input: CreateSopInput,
  createdBy?: string | null
): Promise<SopRecord> {
  await ensureMigrated();
  const db = getDb();
  const doc = normalizeSopDoc(input.rawDoc);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const folder = (input.folder ? String(input.folder) : DEFAULT_SOP_FOLDER).slice(0, 100) || DEFAULT_SOP_FOLDER;
  const tags = normalizeTags(input.tags);
  const status = normStatus(input.status);

  await db.execute({
    sql: `INSERT INTO sops (id, title, description, folder, tags, doc, status, created_by, updated_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      doc.title,
      doc.summary,
      folder,
      JSON.stringify(tags),
      JSON.stringify(doc),
      status,
      createdBy ?? null,
      createdBy ?? null,
      now,
      now,
    ],
  });

  return {
    id,
    title: doc.title,
    description: doc.summary,
    folder,
    tags,
    status,
    doc,
    updatedAt: now,
    createdAt: now,
  };
}

/**
 * Thrown by {@link updateSop} when the row changed since the editor loaded it
 * (optimistic-concurrency). Carries the current server `updated_at`.
 */
export class SopConflictError extends Error {
  currentUpdatedAt: string | null;
  constructor(currentUpdatedAt: string | null) {
    super("SOP was modified by someone else");
    this.name = "SopConflictError";
    this.currentUpdatedAt = currentUpdatedAt;
  }
}

export class SopNotFoundError extends Error {
  constructor() {
    super("SOP not found");
    this.name = "SopNotFoundError";
  }
}

export interface UpdateSopInput {
  rawDoc?: unknown;
  folder?: string;
  tags?: unknown;
  status?: unknown;
}

/**
 * Update a SOP. Pass `expectedUpdatedAt` (the value the editor loaded) to enable
 * an optimistic-concurrency check — a mismatch throws {@link SopConflictError}.
 * The denormalized title/description columns are kept in sync with the doc.
 */
export async function updateSop(
  id: string,
  input: UpdateSopInput,
  updatedBy?: string | null,
  expectedUpdatedAt?: string | null
): Promise<SopRecord> {
  await ensureMigrated();
  const db = getDb();

  const existing = await getSop(id);
  if (!existing) throw new SopNotFoundError();

  if (expectedUpdatedAt !== undefined && existing.updatedAt !== (expectedUpdatedAt ?? null)) {
    throw new SopConflictError(existing.updatedAt);
  }

  const doc = input.rawDoc !== undefined ? normalizeSopDoc(input.rawDoc) : existing.doc;
  const folder = input.folder !== undefined
    ? (String(input.folder).slice(0, 100) || DEFAULT_SOP_FOLDER)
    : existing.folder;
  const tags = input.tags !== undefined ? normalizeTags(input.tags) : existing.tags;
  const status = input.status !== undefined ? normStatus(input.status) : existing.status;
  const now = new Date().toISOString();

  await db.execute({
    sql: `UPDATE sops
          SET title = ?, description = ?, folder = ?, tags = ?, doc = ?, status = ?, updated_by = ?, updated_at = ?
          WHERE id = ?`,
    args: [
      doc.title,
      doc.summary,
      folder,
      JSON.stringify(tags),
      JSON.stringify(doc),
      status,
      updatedBy ?? null,
      now,
      id,
    ],
  });

  return {
    ...existing,
    title: doc.title,
    description: doc.summary,
    folder,
    tags,
    status,
    doc,
    updatedAt: now,
  };
}

export async function deleteSop(id: string): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const res = await db.execute({ sql: "DELETE FROM sops WHERE id = ?", args: [id] });
  return (res.rowsAffected ?? 0) > 0;
}
