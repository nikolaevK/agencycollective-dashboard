import { randomUUID } from "crypto";
import { getDb, ensureMigrated } from "./db";
import type { Row } from "@libsql/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClientNote {
  id: string;
  userId: string;
  authorId: string | null;
  authorName: string | null;
  body: string;
  remindAt: string | null; // ISO date — presence makes this a reminder
  done: boolean; // reminder completed/dismissed
  createdAt: string;
  updatedAt: string;
}

/** A due reminder joined with its client's name, for the alert panel. */
export interface DueReminder extends ClientNote {
  clientName: string;
  clientSlug: string;
}

const MAX_BODY = 10_000;

function rowToNote(row: Row): ClientNote {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    authorId: row.author_id != null ? String(row.author_id) : null,
    authorName: row.author_name != null ? String(row.author_name) : null,
    body: String(row.body ?? ""),
    remindAt: row.remind_at != null ? String(row.remind_at) : null,
    done: Number(row.done ?? 0) === 1,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listClientNotes(userId: string): Promise<ClientNote[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM client_notes WHERE user_id = ? ORDER BY updated_at DESC",
    args: [userId],
  });
  return result.rows.map(rowToNote);
}

export interface CreateClientNoteInput {
  userId: string;
  authorId?: string | null;
  authorName?: string | null;
  body: string;
  remindAt?: string | null;
}

export async function createClientNote(
  input: CreateClientNoteInput
): Promise<ClientNote> {
  await ensureMigrated();
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  const body = (input.body ?? "").slice(0, MAX_BODY);
  await db.execute({
    sql: `INSERT INTO client_notes (id, user_id, author_id, author_name, body, remind_at, done, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    args: [
      id,
      input.userId,
      input.authorId ?? null,
      input.authorName ?? null,
      body,
      input.remindAt ?? null,
      now,
      now,
    ],
  });
  return {
    id,
    userId: input.userId,
    authorId: input.authorId ?? null,
    authorName: input.authorName ?? null,
    body,
    remindAt: input.remindAt ?? null,
    done: false,
    createdAt: now,
    updatedAt: now,
  };
}

export interface UpdateClientNoteInput {
  body?: string;
  remindAt?: string | null;
  done?: boolean;
}

export async function updateClientNote(
  id: string,
  changes: UpdateClientNoteInput
): Promise<void> {
  await ensureMigrated();
  const fields: string[] = [];
  const args: (string | number | null)[] = [];
  if (changes.body !== undefined) {
    fields.push("body = ?");
    args.push(changes.body.slice(0, MAX_BODY));
  }
  if (changes.remindAt !== undefined) {
    fields.push("remind_at = ?");
    args.push(changes.remindAt);
  }
  if (changes.done !== undefined) {
    fields.push("done = ?");
    args.push(changes.done ? 1 : 0);
  }
  if (fields.length === 0) return;
  fields.push("updated_at = datetime('now')");
  args.push(id);
  const db = getDb();
  await db.execute({
    sql: `UPDATE client_notes SET ${fields.join(", ")} WHERE id = ?`,
    args,
  });
}

export async function deleteClientNote(id: string): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "DELETE FROM client_notes WHERE id = ?",
    args: [id],
  });
  return (result.rowsAffected ?? 0) > 0;
}

export async function findClientNote(id: string): Promise<ClientNote | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM client_notes WHERE id = ?",
    args: [id],
  });
  return result.rows[0] ? rowToNote(result.rows[0]) : null;
}

/**
 * Open reminders due on or before `asOf` (default today), across all clients,
 * joined with the client name/slug. Feeds the re-bill alert panel.
 */
export async function listDueReminders(asOf?: string): Promise<DueReminder[]> {
  await ensureMigrated();
  const db = getDb();
  const cutoff = asOf ?? new Date().toISOString();
  const result = await db.execute({
    sql: `SELECT n.*, u.display_name AS client_name, u.slug AS client_slug
          FROM client_notes n
          JOIN users u ON u.id = n.user_id
          WHERE n.remind_at IS NOT NULL
            AND n.done = 0
            AND n.remind_at <= ?
          ORDER BY n.remind_at ASC`,
    args: [cutoff],
  });
  return result.rows.map((row) => ({
    ...rowToNote(row),
    clientName: String(row.client_name ?? ""),
    clientSlug: String(row.client_slug ?? ""),
  }));
}
