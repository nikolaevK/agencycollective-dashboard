import { getDb, ensureMigrated } from "./db";
import type { Row } from "@libsql/client";
import { DEFAULT_SOP_FOLDER } from "./sop";

// ---------------------------------------------------------------------------
// SOP folders (departments). Mirrors lib/mediaFolders.ts: folders are display
// labels; a folder "exists" if it has a metadata row OR any SOP references it.
// ---------------------------------------------------------------------------

export const SOP_FOLDER_COLORS = [
  "gray",
  "red",
  "amber",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
] as const;
export type SopFolderColor = (typeof SOP_FOLDER_COLORS)[number];
export const DEFAULT_FOLDER_COLOR: SopFolderColor = "gray";

export function isFolderColor(v: string): v is SopFolderColor {
  return (SOP_FOLDER_COLORS as readonly string[]).includes(v);
}

export interface SopFolder {
  name: string;
  color: SopFolderColor;
  icon: string | null;
  count: number;
}

/** Strip path separators, trim, cap length. */
export function normalizeFolderName(raw: string): string {
  return String(raw).replace(/[/\\]/g, "-").trim().slice(0, 100);
}

function rowColor(v: unknown): SopFolderColor {
  const c = String(v ?? DEFAULT_FOLDER_COLOR);
  return isFolderColor(c) ? c : DEFAULT_FOLDER_COLOR;
}

/**
 * Every folder: metadata rows ∪ distinct folders referenced by SOPs, with a
 * per-folder SOP count. `General` is always present so new SOPs have a home.
 */
export async function listSopFolders(): Promise<SopFolder[]> {
  await ensureMigrated();
  const db = getDb();
  const map = new Map<string, { color: SopFolderColor; icon: string | null; count: number }>();

  try {
    const meta = await db.execute("SELECT name, color, icon FROM sop_folders");
    for (const r of meta.rows) {
      map.set(String(r.name), {
        color: rowColor(r.color),
        icon: r.icon != null ? String(r.icon) : null,
        count: 0,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/no such table/i.test(msg)) throw err;
  }

  const counts = await db.execute("SELECT folder, COUNT(*) AS n FROM sops GROUP BY folder");
  for (const r of counts.rows) {
    const name = String(r.folder);
    const entry = map.get(name) ?? { color: DEFAULT_FOLDER_COLOR, icon: null, count: 0 };
    entry.count = Number(r.n ?? 0);
    map.set(name, entry);
  }

  if (!map.has(DEFAULT_SOP_FOLDER)) {
    map.set(DEFAULT_SOP_FOLDER, { color: DEFAULT_FOLDER_COLOR, icon: null, count: 0 });
  }

  return Array.from(map.entries())
    .map(([name, v]) => ({ name, color: v.color, icon: v.icon, count: v.count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function folderExists(name: string): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const inMeta = await db.execute({ sql: "SELECT 1 FROM sop_folders WHERE name = ? LIMIT 1", args: [name] });
  if (inMeta.rows.length > 0) return true;
  const inDocs = await db.execute({ sql: "SELECT 1 FROM sops WHERE folder = ? LIMIT 1", args: [name] });
  return inDocs.rows.length > 0;
}

export async function folderSopCount(name: string): Promise<number> {
  await ensureMigrated();
  const db = getDb();
  const r = await db.execute({ sql: "SELECT COUNT(*) AS n FROM sops WHERE folder = ?", args: [name] });
  return Number(r.rows[0]?.n ?? 0);
}

function rowToFolder(row: Row): SopFolder {
  return {
    name: String(row.name),
    color: rowColor(row.color),
    icon: row.icon != null ? String(row.icon) : null,
    count: 0,
  };
}

/** Create or update a folder's color/icon (idempotent upsert on name). */
export async function upsertSopFolder(
  rawName: string,
  color: SopFolderColor,
  icon: string | null
): Promise<SopFolder | { error: string }> {
  await ensureMigrated();
  const name = normalizeFolderName(rawName);
  if (!name) return { error: "Folder name is required" };
  const db = getDb();
  const r = await db.execute({
    sql: `INSERT INTO sop_folders (name, color, icon) VALUES (?, ?, ?)
          ON CONFLICT(name) DO UPDATE SET color = excluded.color, icon = excluded.icon
          RETURNING name, color, icon`,
    args: [name, color, icon],
  });
  return rowToFolder(r.rows[0]);
}

/**
 * Rename a folder: carries color/icon over and bulk-moves every SOP from the
 * old folder to the new one, atomically. Rejects if the target already exists.
 */
export async function renameSopFolder(
  oldName: string,
  rawNew: string
): Promise<{ name: string } | { error: string }> {
  await ensureMigrated();
  const newName = normalizeFolderName(rawNew);
  if (!newName) return { error: "Folder name is required" };
  if (newName === oldName) return { name: newName };
  if (await folderExists(newName)) return { error: "A folder with that name already exists" };

  const db = getDb();
  const prev = await db.execute({ sql: "SELECT color, icon FROM sop_folders WHERE name = ?", args: [oldName] });
  const color = prev.rows.length ? rowColor(prev.rows[0].color) : DEFAULT_FOLDER_COLOR;
  const icon = prev.rows.length && prev.rows[0].icon != null ? String(prev.rows[0].icon) : null;
  await db.batch(
    [
      { sql: "DELETE FROM sop_folders WHERE name = ?", args: [oldName] },
      { sql: "INSERT INTO sop_folders (name, color, icon) VALUES (?, ?, ?) ON CONFLICT(name) DO NOTHING", args: [newName, color, icon] },
      { sql: "UPDATE sops SET folder = ? WHERE folder = ?", args: [newName, oldName] },
    ],
    "write"
  );
  return { name: newName };
}

/** Delete a folder's metadata row. Refuses if any SOP still uses it. */
export async function deleteSopFolder(name: string): Promise<{ error?: string }> {
  await ensureMigrated();
  if (name === DEFAULT_SOP_FOLDER) return { error: "The default folder can't be deleted" };
  const count = await folderSopCount(name);
  if (count > 0) return { error: "Folder is not empty" };
  const db = getDb();
  await db.execute({ sql: "DELETE FROM sop_folders WHERE name = ?", args: [name] });
  return {};
}
