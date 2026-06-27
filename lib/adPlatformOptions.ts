import { getDb, ensureMigrated } from "./db";
import { AD_PLATFORM_OPTIONS } from "./clientProfile";

// ---------------------------------------------------------------------------
// Custom ad-platform options — admin-managed extras on top of the in-code
// built-ins (AD_PLATFORM_OPTIONS: Orange Trail / Concept / Personal). Each
// custom option has a STABLE slug `value` (stored in client_profile.ad_platforms)
// and an editable `label`, so renaming never orphans already-tagged clients.
// Built-ins are permanent and never live in the ad_platform_options table.
// ---------------------------------------------------------------------------

export interface PlatformOption {
  value: string;
  label: string;
}

const MAX_LABEL_LEN = 40;

/** Built-in slugs that a custom option must never collide with. */
const BUILTIN_VALUES = new Set(AD_PLATFORM_OPTIONS.map((o) => o.value));
const BUILTIN_LABELS = new Set(
  AD_PLATFORM_OPTIONS.map((o) => o.label.toLowerCase())
);

/** "Lunar Ads!" → "lunar-ads"; empty/symbol-only falls back to "option". */
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
export async function listCustomAdPlatformOptions(): Promise<PlatformOption[]> {
  await ensureMigrated();
  const db = getDb();
  try {
    const result = await db.execute(
      "SELECT value, label FROM ad_platform_options ORDER BY created_at, label"
    );
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
export async function addCustomAdPlatformOption(
  rawLabel: unknown
): Promise<{ option?: PlatformOption; error?: string }> {
  const label = String(rawLabel ?? "").trim();
  if (!label) return { error: "A name is required" };
  if (label.length > MAX_LABEL_LEN)
    return { error: `Name must be ${MAX_LABEL_LEN} characters or fewer` };

  const existing = await listCustomAdPlatformOptions();
  const lower = label.toLowerCase();
  if (
    BUILTIN_LABELS.has(lower) ||
    existing.some((o) => o.label.toLowerCase() === lower)
  ) {
    return { error: "That option already exists" };
  }

  // Stable slug, made unique against built-ins + existing custom values.
  const base = slugify(label);
  const taken = new Set([...BUILTIN_VALUES, ...existing.map((o) => o.value)]);
  let value = base;
  let n = 2;
  while (taken.has(value)) value = `${base}-${n++}`;

  const db = getDb();
  await db.execute({
    sql: "INSERT INTO ad_platform_options (value, label) VALUES (?, ?)",
    args: [value, label],
  });
  return { option: { value, label } };
}

/** Rename a custom option (value stays — tagged clients are untouched). */
export async function renameCustomAdPlatformOption(
  value: string,
  rawLabel: unknown
): Promise<{ option?: PlatformOption; error?: string }> {
  const label = String(rawLabel ?? "").trim();
  if (!label) return { error: "A name is required" };
  if (label.length > MAX_LABEL_LEN)
    return { error: `Name must be ${MAX_LABEL_LEN} characters or fewer` };

  const existing = await listCustomAdPlatformOptions();
  if (!existing.some((o) => o.value === value))
    return { error: "Option not found" };

  const lower = label.toLowerCase();
  if (
    BUILTIN_LABELS.has(lower) ||
    existing.some((o) => o.value !== value && o.label.toLowerCase() === lower)
  ) {
    return { error: "That option already exists" };
  }

  const db = getDb();
  await db.execute({
    sql: "UPDATE ad_platform_options SET label = ? WHERE value = ?",
    args: [label, value],
  });
  return { option: { value, label } };
}

/**
 * Remove a custom option. Clients already tagged with its slug keep the tag
 * (it renders as a plain chip) — removal only takes it out of the picker.
 */
export async function removeCustomAdPlatformOption(value: string): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: "DELETE FROM ad_platform_options WHERE value = ?",
    args: [value],
  });
}
