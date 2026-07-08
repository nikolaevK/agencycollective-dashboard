import { getDb, ensureMigrated } from "./db";
import { STAGE_OPTIONS, HEALTH_OPTIONS } from "./clientProfile";

// ---------------------------------------------------------------------------
// Custom roster options (Stage / Client Health) — admin-managed extras on top
// of the in-code built-ins (STAGE_OPTIONS / HEALTH_OPTIONS), mirroring
// lib/adPlatformOptions.ts. Each custom option has a STABLE slug `value`
// (stored in client_profile.stages / .health) and an editable `label`, so
// renaming never orphans already-tagged clients. Built-ins are permanent and
// never live in the roster_options table. One table, discriminated by `kind`.
// ---------------------------------------------------------------------------

export type RosterOptionKind = "stage" | "health";

export interface RosterOption {
  value: string;
  label: string;
}

const MAX_LABEL_LEN = 40;

export function parseRosterOptionKind(raw: unknown): RosterOptionKind | null {
  return raw === "stage" || raw === "health" ? raw : null;
}

/** Built-in slugs/labels that a custom option must never collide with. */
const BUILTINS: Record<RosterOptionKind, ReadonlyArray<RosterOption>> = {
  stage: STAGE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
  health: HEALTH_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
};

function builtinValues(kind: RosterOptionKind): Set<string> {
  return new Set(BUILTINS[kind].map((o) => o.value));
}

function builtinLabels(kind: RosterOptionKind): Set<string> {
  return new Set(BUILTINS[kind].map((o) => o.label.toLowerCase()));
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

/** Custom options only (built-ins are a code constant), oldest first. */
export async function listCustomRosterOptions(
  kind: RosterOptionKind
): Promise<RosterOption[]> {
  await ensureMigrated();
  const db = getDb();
  try {
    const result = await db.execute({
      sql: "SELECT value, label FROM roster_options WHERE kind = ? ORDER BY created_at, label",
      args: [kind],
    });
    return result.rows.map((r) => ({
      value: String(r.value),
      label: String(r.label),
    }));
  } catch (err) {
    if (isNoSuchTable(err)) return [];
    throw err;
  }
}

/**
 * Add a custom option. Validates + slugifies the label, rejecting duplicates
 * (by label, case-insensitive, against built-ins AND existing custom). Returns
 * the created option or a human-readable error.
 */
export async function addCustomRosterOption(
  kind: RosterOptionKind,
  rawLabel: unknown
): Promise<{ option?: RosterOption; error?: string }> {
  const label = String(rawLabel ?? "").trim();
  if (!label) return { error: "A name is required" };
  if (label.length > MAX_LABEL_LEN)
    return { error: `Name must be ${MAX_LABEL_LEN} characters or fewer` };

  const existing = await listCustomRosterOptions(kind);
  const lower = label.toLowerCase();
  if (
    builtinLabels(kind).has(lower) ||
    existing.some((o) => o.label.toLowerCase() === lower)
  ) {
    return { error: "That option already exists" };
  }

  // Stable slug, made unique against built-ins + existing custom values.
  const base = slugify(label);
  const taken = new Set([...builtinValues(kind), ...existing.map((o) => o.value)]);
  let value = base;
  let n = 2;
  while (taken.has(value)) value = `${base}-${n++}`;

  const db = getDb();
  await db.execute({
    sql: "INSERT INTO roster_options (kind, value, label) VALUES (?, ?, ?)",
    args: [kind, value, label],
  });
  return { option: { value, label } };
}

/** Rename a custom option (value stays — tagged clients are untouched). */
export async function renameCustomRosterOption(
  kind: RosterOptionKind,
  value: string,
  rawLabel: unknown
): Promise<{ option?: RosterOption; error?: string }> {
  const label = String(rawLabel ?? "").trim();
  if (!label) return { error: "A name is required" };
  if (label.length > MAX_LABEL_LEN)
    return { error: `Name must be ${MAX_LABEL_LEN} characters or fewer` };

  const existing = await listCustomRosterOptions(kind);
  if (!existing.some((o) => o.value === value))
    return { error: "Option not found" };

  const lower = label.toLowerCase();
  if (
    builtinLabels(kind).has(lower) ||
    existing.some((o) => o.value !== value && o.label.toLowerCase() === lower)
  ) {
    return { error: "That option already exists" };
  }

  const db = getDb();
  await db.execute({
    sql: "UPDATE roster_options SET label = ? WHERE kind = ? AND value = ?",
    args: [label, kind, value],
  });
  return { option: { value, label } };
}

/**
 * Remove a custom option. Clients already tagged with its slug keep the tag
 * (it renders as a plain chip) — removal only takes it out of the picker.
 */
export async function removeCustomRosterOption(
  kind: RosterOptionKind,
  value: string
): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: "DELETE FROM roster_options WHERE kind = ? AND value = ?",
    args: [kind, value],
  });
}
