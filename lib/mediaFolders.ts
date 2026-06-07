import { getDb, ensureMigrated } from "./db";
import type { Row } from "@libsql/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const MEDIA_FOLDER_COLORS = [
  "gray",
  "red",
  "amber",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
] as const;
export type MediaFolderColor = (typeof MEDIA_FOLDER_COLORS)[number];
export const DEFAULT_FOLDER_COLOR: MediaFolderColor = "gray";

export function isFolderColor(v: string): v is MediaFolderColor {
  return (MEDIA_FOLDER_COLORS as readonly string[]).includes(v);
}

export interface MediaFolder {
  name: string;
  color: MediaFolderColor;
  important: boolean;
}

/** Strip path separators, trim, cap length. Folder names are display labels. */
export function normalizeFolderName(raw: string): string {
  return String(raw).replace(/[/\\]/g, "-").trim().slice(0, 100);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Every folder that exists: metadata rows ∪ distinct folders referenced by
 * documents (those inherit the default color until recolored). Sorted by name.
 */
export async function listFoldersWithColors(): Promise<MediaFolder[]> {
  await ensureMigrated();
  const db = getDb();
  const map = new Map<string, { color: MediaFolderColor; important: boolean }>();

  // Metadata rows are best-effort: if the table somehow isn't there yet
  // (stuck version stamp, a dev server that migrated before it existed), fall
  // back to document-derived folders with the default color rather than 500.
  try {
    const meta = await db.execute("SELECT name, color, important FROM media_folders");
    for (const r of meta.rows) {
      const c = String(r.color ?? DEFAULT_FOLDER_COLOR);
      map.set(String(r.name), {
        color: isFolderColor(c) ? c : DEFAULT_FOLDER_COLOR,
        important: Number(r.important ?? 0) === 1,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/no such table/i.test(msg)) throw err;
    console.warn("[mediaFolders] media_folders table missing — colors unavailable until migration runs");
  }

  const docFolders = await db.execute("SELECT DISTINCT folder FROM media_documents");
  for (const r of docFolders.rows) {
    const name = String(r.folder);
    if (!map.has(name)) map.set(name, { color: DEFAULT_FOLDER_COLOR, important: false });
  }
  return Array.from(map.entries())
    .map(([name, v]) => ({ name, color: v.color, important: v.important }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function folderExists(name: string): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const inMeta = await db.execute({ sql: "SELECT 1 FROM media_folders WHERE name = ? LIMIT 1", args: [name] });
  if (inMeta.rows.length > 0) return true;
  const inDocs = await db.execute({ sql: "SELECT 1 FROM media_documents WHERE folder = ? LIMIT 1", args: [name] });
  return inDocs.rows.length > 0;
}

export async function getFolderColor(name: string): Promise<MediaFolderColor> {
  await ensureMigrated();
  const db = getDb();
  const r = await db.execute({ sql: "SELECT color FROM media_folders WHERE name = ?", args: [name] });
  if (r.rows.length === 0) return DEFAULT_FOLDER_COLOR;
  const c = String(r.rows[0].color ?? DEFAULT_FOLDER_COLOR);
  return isFolderColor(c) ? c : DEFAULT_FOLDER_COLOR;
}

export async function folderDocCount(name: string): Promise<number> {
  await ensureMigrated();
  const db = getDb();
  const r = await db.execute({ sql: "SELECT COUNT(*) AS n FROM media_documents WHERE folder = ?", args: [name] });
  return Number(r.rows[0]?.n ?? 0);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function rowToFolder(row: Row): MediaFolder {
  const c = String(row.color ?? DEFAULT_FOLDER_COLOR);
  return {
    name: String(row.name),
    color: isFolderColor(c) ? c : DEFAULT_FOLDER_COLOR,
    important: Number(row.important ?? 0) === 1,
  };
}

/** Create or recolor a folder (idempotent upsert on name). Preserves importance. */
export async function upsertFolder(
  rawName: string,
  color: MediaFolderColor,
  actorId: string | null,
  actorName: string | null
): Promise<MediaFolder | { error: string }> {
  await ensureMigrated();
  const name = normalizeFolderName(rawName);
  if (!name) return { error: "Folder name is required" };
  const db = getDb();
  const r = await db.execute({
    sql: `INSERT INTO media_folders (name, color, created_by, created_by_name)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(name) DO UPDATE SET color = excluded.color, updated_at = datetime('now')
          RETURNING name, color, important`,
    args: [name, color, actorId, actorName],
  });
  return rowToFolder(r.rows[0]);
}

/** Toggle a folder's importance. Creates the metadata row if needed. */
export async function setFolderImportant(
  rawName: string,
  important: boolean
): Promise<MediaFolder | { error: string }> {
  await ensureMigrated();
  const name = normalizeFolderName(rawName);
  if (!name) return { error: "Folder name is required" };
  const db = getDb();
  const r = await db.execute({
    sql: `INSERT INTO media_folders (name, important) VALUES (?, ?)
          ON CONFLICT(name) DO UPDATE SET important = excluded.important, updated_at = datetime('now')
          RETURNING name, color, important`,
    args: [name, important ? 1 : 0],
  });
  return rowToFolder(r.rows[0]);
}

/**
 * Rename a folder: carries the color over and bulk-moves every document from
 * the old folder string to the new one, atomically. Rejects if the target
 * name already exists (no silent merge).
 */
export async function renameFolder(
  oldName: string,
  rawNew: string
): Promise<{ name: string } | { error: string }> {
  await ensureMigrated();
  const newName = normalizeFolderName(rawNew);
  if (!newName) return { error: "Folder name is required" };
  if (newName === oldName) return { name: newName };
  if (await folderExists(newName)) return { error: "A folder with that name already exists" };

  const db = getDb();
  // Carry color + importance over to the new name.
  const prev = await db.execute({ sql: "SELECT color, important FROM media_folders WHERE name = ?", args: [oldName] });
  const color = prev.rows.length ? String(prev.rows[0].color ?? DEFAULT_FOLDER_COLOR) : DEFAULT_FOLDER_COLOR;
  const important = prev.rows.length ? Number(prev.rows[0].important ?? 0) : 0;
  await db.batch(
    [
      { sql: "DELETE FROM media_folders WHERE name = ?", args: [oldName] },
      { sql: "INSERT INTO media_folders (name, color, important) VALUES (?, ?, ?) ON CONFLICT(name) DO NOTHING", args: [newName, color, important] },
      { sql: "UPDATE media_documents SET folder = ? WHERE folder = ?", args: [newName, oldName] },
    ],
    "write"
  );
  return { name: newName };
}

/** Delete a folder's metadata row. Refuses if any document still uses it. */
export async function deleteFolder(name: string): Promise<{ error?: string }> {
  await ensureMigrated();
  const count = await folderDocCount(name);
  if (count > 0) return { error: "Folder is not empty" };
  const db = getDb();
  await db.execute({ sql: "DELETE FROM media_folders WHERE name = ?", args: [name] });
  return {};
}
