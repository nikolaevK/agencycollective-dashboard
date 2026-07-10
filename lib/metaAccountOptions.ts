import { getDb, ensureMigrated } from "./db";
import { getAgencyConfig, updateAgencyConfig } from "./agencyConfig";

// ---------------------------------------------------------------------------
// Meta Accounts Directory — Stage / Status chip vocabulary. Unlike the roster
// options (which keep permanent built-ins in code), the FULL vocabulary lives
// in the meta_account_options table and is entirely admin-managed: add, rename,
// recolor, reorder, and remove. Initial values are SEEDED ONCE into the DB via
// an agency_config marker, so deleting a seeded option never resurrects it on
// the next boot. Each option has a STABLE slug `value` (stored on
// meta_accounts.stage / .status) and an editable label/color/order, so renaming
// or recoloring never orphans already-tagged accounts.
// ---------------------------------------------------------------------------

export type MetaOptionKind = "stage" | "status";

export interface MetaAccountOption {
  value: string;
  label: string;
  color: string;
  sortOrder: number;
}

const MAX_LABEL_LEN = 40;
const SEED_MARKER_KEY = "meta_account_options_seeded";

/**
 * Chip color tokens. Kept in lockstep with META_OPTION_CHIP_CLS in
 * components/meta-accounts/presentation.ts — Tailwind can't purge dynamically
 * built class strings, so both sides enumerate a fixed palette.
 */
export const OPTION_COLOR_TOKENS = [
  "slate",
  "gray",
  "sky",
  "blue",
  "indigo",
  "violet",
  "teal",
  "emerald",
  "amber",
  "orange",
  "red",
  "pink",
] as const;

export type OptionColor = (typeof OPTION_COLOR_TOKENS)[number];

function normalizeColor(raw: unknown): OptionColor {
  const c = String(raw ?? "").trim().toLowerCase();
  return (OPTION_COLOR_TOKENS as readonly string[]).includes(c)
    ? (c as OptionColor)
    : "slate";
}

/** Initial vocabulary seeded once into the DB (then fully editable). */
const SEED: Record<MetaOptionKind, ReadonlyArray<{ value: string; label: string; color: OptionColor }>> = {
  // Warm-up pipeline (Concept after-care guide + Unparalleled playbook).
  stage: [
    { value: "harvested", label: "Harvested", color: "slate" },
    { value: "setup", label: "Setup", color: "sky" },
    { value: "card-added", label: "Card Added", color: "amber" },
    { value: "engagement-warmup", label: "Engagement Warm-Up", color: "teal" },
    { value: "high-intent-live", label: "High-Intent Live", color: "violet" },
    { value: "scaling", label: "Scaling", color: "blue" },
    { value: "trusted", label: "Trusted", color: "emerald" },
  ],
  // Account health / standing.
  status: [
    { value: "active", label: "Active", color: "emerald" },
    { value: "flagged", label: "Flagged", color: "amber" },
    { value: "restricted", label: "Restricted", color: "orange" },
    { value: "banned", label: "Banned", color: "red" },
    { value: "account-not-found", label: "Account Not Found", color: "gray" },
  ],
};

export function parseMetaOptionKind(raw: unknown): MetaOptionKind | null {
  return raw === "stage" || raw === "status" ? raw : null;
}

/** "Paused Ads!" → "paused-ads"; empty/symbol-only falls back to "option". */
function slugify(label: string): string {
  const base = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "option";
}

function isNoSuchTable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /no such table/i.test(msg);
}

// One seed per process is enough to skip the marker round-trip; the DB marker
// is the cross-process source of truth.
let seededInProcess = false;

/**
 * Seed the initial vocabulary exactly once (guarded by an agency_config
 * marker). Best-effort: if anything fails (e.g. a not-yet-migrated DB), option
 * listing still works — it just returns whatever rows already exist.
 */
async function ensureSeeded(): Promise<void> {
  if (seededInProcess) return;
  try {
    const marker = await getAgencyConfig(SEED_MARKER_KEY);
    if (marker === "1") {
      seededInProcess = true;
      return;
    }
    const db = getDb();
    const stmts: { sql: string; args: (string | number)[] }[] = [];
    for (const kind of ["stage", "status"] as MetaOptionKind[]) {
      SEED[kind].forEach((o, i) => {
        stmts.push({
          // INSERT OR IGNORE: never clobber an admin edit that predates the
          // marker being set (belt-and-suspenders — the marker already guards).
          sql: "INSERT OR IGNORE INTO meta_account_options (kind, value, label, color, sort_order) VALUES (?, ?, ?, ?, ?)",
          args: [kind, o.value, o.label, o.color, i],
        });
      });
    }
    if (stmts.length) await db.batch(stmts, "write");
    await updateAgencyConfig(SEED_MARKER_KEY, "1");
    seededInProcess = true;
  } catch (err) {
    if (!isNoSuchTable(err)) {
      console.error("[metaAccountOptions] seed failed (non-fatal):", err);
    }
  }
}

function rowToOption(r: Record<string, unknown>): MetaAccountOption {
  return {
    value: String(r.value),
    label: String(r.label),
    color: normalizeColor(r.color),
    sortOrder: Number(r.sort_order ?? 0),
  };
}

/** The full admin-managed vocabulary for a kind, in display order. */
export async function listMetaAccountOptions(
  kind: MetaOptionKind
): Promise<MetaAccountOption[]> {
  await ensureMigrated();
  await ensureSeeded();
  const db = getDb();
  try {
    const result = await db.execute({
      sql: "SELECT value, label, color, sort_order FROM meta_account_options WHERE kind = ? ORDER BY sort_order, created_at, label",
      args: [kind],
    });
    return result.rows.map(rowToOption);
  } catch (err) {
    if (isNoSuchTable(err)) return [];
    throw err;
  }
}

/** Both vocabularies in ONE Turso round-trip — the page-load path. */
export async function listAllMetaAccountOptions(): Promise<
  Record<MetaOptionKind, MetaAccountOption[]>
> {
  await ensureMigrated();
  await ensureSeeded();
  const db = getDb();
  try {
    const result = await db.execute(
      "SELECT kind, value, label, color, sort_order FROM meta_account_options ORDER BY sort_order, created_at, label"
    );
    const out: Record<MetaOptionKind, MetaAccountOption[]> = { stage: [], status: [] };
    for (const r of result.rows) {
      const kind = parseMetaOptionKind(r.kind);
      if (kind) out[kind].push(rowToOption(r));
    }
    return out;
  } catch (err) {
    if (isNoSuchTable(err)) return { stage: [], status: [] };
    throw err;
  }
}

/**
 * Add an option. Validates + slugifies the label, rejecting duplicate labels
 * (case-insensitive). Appends at the end of the display order. Returns the
 * created option or a human-readable error.
 */
export async function addMetaAccountOption(
  kind: MetaOptionKind,
  rawLabel: unknown,
  rawColor?: unknown
): Promise<{ option?: MetaAccountOption; error?: string }> {
  const label = String(rawLabel ?? "").trim();
  if (!label) return { error: "A name is required" };
  if (label.length > MAX_LABEL_LEN)
    return { error: `Name must be ${MAX_LABEL_LEN} characters or fewer` };

  const existing = await listMetaAccountOptions(kind);
  const lower = label.toLowerCase();
  if (existing.some((o) => o.label.toLowerCase() === lower)) {
    return { error: "That option already exists" };
  }

  const base = slugify(label);
  const taken = new Set(existing.map((o) => o.value));
  let value = base;
  let n = 2;
  while (taken.has(value)) value = `${base}-${n++}`;

  const color = normalizeColor(rawColor);
  const sortOrder = existing.reduce((max, o) => Math.max(max, o.sortOrder), -1) + 1;

  const db = getDb();
  await db.execute({
    sql: "INSERT INTO meta_account_options (kind, value, label, color, sort_order) VALUES (?, ?, ?, ?, ?)",
    args: [kind, value, label, color, sortOrder],
  });
  return { option: { value, label, color, sortOrder } };
}

/**
 * Edit an option's label and/or color (value/slug stays — tagged accounts are
 * untouched). Rejects a label that collides with another option.
 */
export async function updateMetaAccountOption(
  kind: MetaOptionKind,
  value: string,
  changes: { label?: unknown; color?: unknown }
): Promise<{ option?: MetaAccountOption; error?: string }> {
  const existing = await listMetaAccountOptions(kind);
  const current = existing.find((o) => o.value === value);
  if (!current) return { error: "Option not found" };

  let label = current.label;
  if (changes.label !== undefined) {
    label = String(changes.label ?? "").trim();
    if (!label) return { error: "A name is required" };
    if (label.length > MAX_LABEL_LEN)
      return { error: `Name must be ${MAX_LABEL_LEN} characters or fewer` };
    const lower = label.toLowerCase();
    if (existing.some((o) => o.value !== value && o.label.toLowerCase() === lower))
      return { error: "That option already exists" };
  }

  const color = changes.color !== undefined ? normalizeColor(changes.color) : current.color;

  const db = getDb();
  await db.execute({
    sql: "UPDATE meta_account_options SET label = ?, color = ? WHERE kind = ? AND value = ?",
    args: [label, color, kind, value],
  });
  return { option: { value, label, color, sortOrder: current.sortOrder } };
}

/**
 * Rewrite the display order from an explicit list of values (index = new
 * sort_order). Values not present are left where they are (defensive). Atomic.
 */
export async function reorderMetaAccountOptions(
  kind: MetaOptionKind,
  orderedValues: string[]
): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  const stmts = orderedValues.map((value, i) => ({
    sql: "UPDATE meta_account_options SET sort_order = ? WHERE kind = ? AND value = ?",
    args: [i, kind, value] as (string | number)[],
  }));
  if (stmts.length) await db.batch(stmts, "write");
}

/**
 * Remove an option. Accounts already tagged with its slug keep the tag (it
 * renders as a plain chip) — removal only takes it out of the picker/filters.
 */
export async function removeMetaAccountOption(
  kind: MetaOptionKind,
  value: string
): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: "DELETE FROM meta_account_options WHERE kind = ? AND value = ?",
    args: [kind, value],
  });
}
