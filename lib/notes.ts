import crypto from "crypto";
import { getDb, ensureMigrated } from "./db";
import type { Row } from "@libsql/client";

export type NotePriority = "high" | "medium" | "low";
export const NOTE_PRIORITIES: NotePriority[] = ["high", "medium", "low"];

export const NOTE_TITLE_MAX = 200;
export const NOTE_BODY_MAX = 50_000;
export const NOTE_TAG_MAX = 32;
export const NOTE_MAX_TAGS = 12;
export const NOTE_MAX_SHARES = 50;

export interface NoteRecord {
  id: string;
  ownerId: string;
  title: string;
  body: string;
  priority: NotePriority;
  dueDate: string | null;
  tags: string[];
  linkedGoogleEventId: string | null;
  linkedDealId: string | null;
  createdAt: string;
  updatedAt: string;
}

function parseTags(raw: unknown): string[] {
  if (raw == null) return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string" && v.length > 0);
  } catch {
    return [];
  }
}

export function sanitizeTags(input: unknown): string[] {
  const raw: unknown[] = Array.isArray(input)
    ? input
    : typeof input === "string" && input.length > 0
      ? input.split(",")
      : [];
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (!trimmed || trimmed.length > NOTE_TAG_MAX) continue;
    const norm = trimmed.toLowerCase();
    if (seen.has(norm)) continue;
    seen.add(norm);
    cleaned.push(trimmed);
    if (cleaned.length >= NOTE_MAX_TAGS) break;
  }
  return cleaned;
}

export function isNotePriority(v: unknown): v is NotePriority {
  return typeof v === "string" && (NOTE_PRIORITIES as string[]).includes(v);
}

/**
 * Clean a submitted share list: drop unknown ids, self-shares, duplicates,
 * and anything past the per-note cap. `validIds` is the set of acceptable
 * recipient ids (typically every active closer's id). Returns [] when the
 * raw input is not an array — callers can treat that as "client sent
 * something invalid, treat as no-change".
 */
export function sanitizeShareIds(
  raw: unknown,
  selfId: string,
  validIds: Set<string>
): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const id = v.trim();
    if (!id || id === selfId) continue;
    if (!validIds.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= NOTE_MAX_SHARES) break;
  }
  return out;
}

function rowToNote(row: Row): NoteRecord {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    title: String(row.title),
    body: String(row.body ?? ""),
    priority: String(row.priority || "medium") as NotePriority,
    dueDate: row.due_date != null ? String(row.due_date) : null,
    tags: parseTags(row.tags),
    linkedGoogleEventId: row.linked_google_event_id != null ? String(row.linked_google_event_id) : null,
    linkedDealId: row.linked_deal_id != null ? String(row.linked_deal_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listNotesByOwner(ownerId: string): Promise<NoteRecord[]> {
  await ensureMigrated();
  const db = getDb();
  // Cap at 500 to bound payload + client memory. Typical working set is
  // dozens; if a user crosses 500 we'll add server pagination then.
  const result = await db.execute({
    sql: "SELECT * FROM notes WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 500",
    args: [ownerId],
  });
  return result.rows.map(rowToNote);
}

export async function findNote(id: string): Promise<NoteRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM notes WHERE id = ?",
    args: [id],
  });
  return result.rows[0] ? rowToNote(result.rows[0]) : null;
}

export interface CreateNoteInput {
  ownerId: string;
  title: string;
  body?: string;
  priority?: NotePriority;
  dueDate?: string | null;
  tags?: string[];
  linkedGoogleEventId?: string | null;
  linkedDealId?: string | null;
}

export async function createNote(input: CreateNoteInput): Promise<NoteRecord> {
  await ensureMigrated();
  const db = getDb();
  const id = crypto.randomUUID();
  const tags = input.tags ?? [];
  await db.execute({
    sql: `INSERT INTO notes
            (id, owner_id, title, body, priority, due_date, tags, linked_google_event_id, linked_deal_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.ownerId,
      input.title,
      input.body ?? "",
      input.priority ?? "medium",
      input.dueDate ?? null,
      tags.length > 0 ? JSON.stringify(tags) : null,
      input.linkedGoogleEventId ?? null,
      input.linkedDealId ?? null,
    ],
  });
  const created = await findNote(id);
  if (!created) throw new Error("Note insert did not persist");
  return created;
}

export interface UpdateNoteInput {
  title?: string;
  body?: string;
  priority?: NotePriority;
  dueDate?: string | null;
  tags?: string[];
  linkedGoogleEventId?: string | null;
  linkedDealId?: string | null;
}

export async function updateNote(id: string, changes: UpdateNoteInput): Promise<void> {
  const fields: string[] = [];
  const args: (string | null)[] = [];

  if (changes.title !== undefined) {
    fields.push("title = ?");
    args.push(changes.title);
  }
  if (changes.body !== undefined) {
    fields.push("body = ?");
    args.push(changes.body);
  }
  if (changes.priority !== undefined) {
    fields.push("priority = ?");
    args.push(changes.priority);
  }
  if (changes.dueDate !== undefined) {
    fields.push("due_date = ?");
    args.push(changes.dueDate);
  }
  if (changes.tags !== undefined) {
    fields.push("tags = ?");
    args.push(changes.tags.length > 0 ? JSON.stringify(changes.tags) : null);
  }
  if (changes.linkedGoogleEventId !== undefined) {
    fields.push("linked_google_event_id = ?");
    args.push(changes.linkedGoogleEventId);
  }
  if (changes.linkedDealId !== undefined) {
    fields.push("linked_deal_id = ?");
    args.push(changes.linkedDealId);
  }

  if (fields.length === 0) return;
  fields.push("updated_at = datetime('now')");
  args.push(id);

  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: `UPDATE notes SET ${fields.join(", ")} WHERE id = ?`,
    args,
  });
}

export async function deleteNote(id: string): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "DELETE FROM notes WHERE id = ?",
    args: [id],
  });
  return (result.rowsAffected ?? 0) > 0;
}

// ── Sharing ───────────────────────────────────────────────────────────

export async function getNoteShares(noteId: string): Promise<string[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT shared_with_id FROM note_shares WHERE note_id = ?",
    args: [noteId],
  });
  return result.rows.map((row) => String(row.shared_with_id));
}

/**
 * Replace a note's share list atomically — compute the delta against what's
 * already stored and apply only inserts/deletes. Duplicate / invalid ids
 * caller is expected to have filtered.
 */
export async function setNoteShares(noteId: string, recipientIds: string[]): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  const current = new Set(await getNoteShares(noteId));
  const next = new Set(recipientIds);

  const toAdd = [...next].filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !next.has(id));

  for (const id of toAdd) {
    await db.execute({
      sql: "INSERT OR IGNORE INTO note_shares (note_id, shared_with_id) VALUES (?, ?)",
      args: [noteId, id],
    });
  }
  for (const id of toRemove) {
    await db.execute({
      sql: "DELETE FROM note_shares WHERE note_id = ? AND shared_with_id = ?",
      args: [noteId, id],
    });
  }
}

export interface SharedNoteRecord extends NoteRecord {
  ownerName: string | null;
  sharedAt: string;
  /** Null when the recipient hasn't archived; ISO timestamp when they have. */
  archivedAt: string | null;
}

/**
 * Notes where the given user is a recipient (not the owner). Joined with the
 * owner's display name so the card can render "Shared by X" without a
 * second fetch.
 *
 * `archived = false` (default) returns only active shares; `archived = true`
 * returns only archived ones. Intentionally never returns both mixed — the
 * UI surfaces them in distinct sections.
 */
export async function listNotesSharedWithUser(
  userId: string,
  options: { archived?: boolean } = {}
): Promise<SharedNoteRecord[]> {
  await ensureMigrated();
  const db = getDb();
  const archived = options.archived === true;
  const result = await db.execute({
    sql: `SELECT n.*, c.display_name AS owner_name,
                 ns.created_at AS shared_at, ns.archived_at AS archived_at
            FROM note_shares ns
            JOIN notes n ON n.id = ns.note_id
       LEFT JOIN closers c ON c.id = n.owner_id
           WHERE ns.shared_with_id = ?
             AND ns.archived_at IS ${archived ? "NOT NULL" : "NULL"}
        ORDER BY ${archived ? "ns.archived_at" : "n.updated_at"} DESC
           LIMIT 500`,
    args: [userId],
  });
  return result.rows.map((row) => ({
    id: String(row.id),
    ownerId: String(row.owner_id),
    title: String(row.title),
    body: String(row.body ?? ""),
    priority: String(row.priority || "medium") as NotePriority,
    dueDate: row.due_date != null ? String(row.due_date) : null,
    tags: parseTags(row.tags),
    linkedGoogleEventId: row.linked_google_event_id != null ? String(row.linked_google_event_id) : null,
    linkedDealId: row.linked_deal_id != null ? String(row.linked_deal_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    ownerName: row.owner_name != null ? String(row.owner_name) : null,
    sharedAt: String(row.shared_at),
    archivedAt: row.archived_at != null ? String(row.archived_at) : null,
  }));
}

/**
 * Toggle the archived flag on a single (note, recipient) share row. Only
 * the recipient themself should call this — the caller is responsible for
 * checking that the session user owns the share (via isShareRecipient).
 */
export async function setShareArchived(
  noteId: string,
  recipientId: string,
  archived: boolean
): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: `UPDATE note_shares
             SET archived_at = ${archived ? "datetime('now')" : "NULL"}
           WHERE note_id = ? AND shared_with_id = ?`,
    args: [noteId, recipientId],
  });
  return (result.rowsAffected ?? 0) > 0;
}

export async function isShareRecipient(noteId: string, recipientId: string): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT 1 FROM note_shares WHERE note_id = ? AND shared_with_id = ? LIMIT 1",
    args: [noteId, recipientId],
  });
  return result.rows.length > 0;
}

// ── Unread shared notes (sidebar badge) ───────────────────────────────

/**
 * Count of active shares for this user created after their last notes-page
 * visit. Archived shares don't count (they've dismissed those). First-time
 * users have a null last-visit timestamp → everything is unread.
 */
export async function getUnreadSharedNotesCount(userId: string): Promise<number> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT COUNT(*) AS c
            FROM note_shares ns
           WHERE ns.shared_with_id = ?
             AND ns.archived_at IS NULL
             AND ns.created_at > COALESCE(
               (SELECT notes_last_viewed_at FROM closers WHERE id = ?),
               '1970-01-01 00:00:00'
             )`,
    args: [userId, userId],
  });
  return Number(result.rows[0]?.c ?? 0);
}

/** Stamp the user's last notes-page visit so future shares arrive as "new". */
export async function markNotesViewed(userId: string): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: "UPDATE closers SET notes_last_viewed_at = datetime('now') WHERE id = ?",
    args: [userId],
  });
}

/**
 * Get all shares grouped by note_id for a set of notes. Used by the list
 * endpoint so the owner's UI can show who they've shared each note with.
 */
export async function getSharesForNoteIds(noteIds: string[]): Promise<Record<string, string[]>> {
  if (noteIds.length === 0) return {};
  await ensureMigrated();
  const db = getDb();
  const placeholders = noteIds.map(() => "?").join(",");
  const result = await db.execute({
    sql: `SELECT note_id, shared_with_id FROM note_shares WHERE note_id IN (${placeholders})`,
    args: noteIds,
  });
  const out: Record<string, string[]> = {};
  for (const row of result.rows) {
    const nid = String(row.note_id);
    const sid = String(row.shared_with_id);
    (out[nid] ??= []).push(sid);
  }
  return out;
}
