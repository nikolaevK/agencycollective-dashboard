import crypto from "crypto";
import { getDb, ensureMigrated } from "./db";
import type { Row } from "@libsql/client";

export const MESSAGE_BODY_MAX = 5_000;
export const MESSAGE_PAGE_LIMIT = 100;
/** Window an admin counts as "online". Heartbeat fires every 60s; this is
 *  1.5× the heartbeat to avoid online↔offline flicker at the boundary. */
export const PRESENCE_FRESH_SECONDS = 90;

export type SenderType = "client" | "admin" | "system";

export interface ConversationRecord {
  id: string;
  userId: string;
  lastMessageAt: string | null;
  lastUserReadAt: string | null;
  lastAdminReadAt: string | null;
  createdAt: string;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  senderType: SenderType;
  senderId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

/**
 * Cursor-based pagination tuple. Two messages with the same second-precision
 * created_at are disambiguated by id, so polling never skips or duplicates.
 */
export interface MessageCursor {
  createdAt: string;
  id: string;
}

function rowToConversation(row: Row): ConversationRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    lastMessageAt: row.last_message_at != null ? String(row.last_message_at) : null,
    lastUserReadAt: row.last_user_read_at != null ? String(row.last_user_read_at) : null,
    lastAdminReadAt: row.last_admin_read_at != null ? String(row.last_admin_read_at) : null,
    createdAt: String(row.created_at),
  };
}

function rowToMessage(row: Row): MessageRecord {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    senderType: String(row.sender_type) as SenderType,
    senderId: String(row.sender_id),
    body: String(row.body ?? ""),
    createdAt: String(row.created_at),
    editedAt: row.edited_at != null ? String(row.edited_at) : null,
    deletedAt: row.deleted_at != null ? String(row.deleted_at) : null,
  };
}

/**
 * Fetch the conversation for this user, creating one on first access. Single
 * SQL round-trip when it already exists; the INSERT OR IGNORE + re-SELECT only
 * fires for the very first message a user ever sends.
 */
export async function getOrCreateConversation(userId: string): Promise<ConversationRecord> {
  await ensureMigrated();
  const db = getDb();

  const existing = await db.execute({
    sql: "SELECT * FROM conversations WHERE user_id = ?",
    args: [userId],
  });
  if (existing.rows[0]) return rowToConversation(existing.rows[0]);

  const id = crypto.randomUUID();
  await db.execute({
    sql: "INSERT OR IGNORE INTO conversations (id, user_id) VALUES (?, ?)",
    args: [id, userId],
  });
  const created = await db.execute({
    sql: "SELECT * FROM conversations WHERE user_id = ?",
    args: [userId],
  });
  if (!created.rows[0]) throw new Error("Conversation insert did not persist");
  return rowToConversation(created.rows[0]);
}

export async function findConversationByUserId(userId: string): Promise<ConversationRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM conversations WHERE user_id = ?",
    args: [userId],
  });
  return result.rows[0] ? rowToConversation(result.rows[0]) : null;
}

/**
 * Most recent N messages for a conversation, oldest-first so the UI can
 * append directly. Soft-deleted rows are returned with their tombstone
 * timestamp so the UI can render "Message deleted" without dropping them
 * (would shift cursors and confuse polling).
 */
export async function listRecentMessages(
  conversationId: string,
  limit: number = MESSAGE_PAGE_LIMIT
): Promise<MessageRecord[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM messages
           WHERE conversation_id = ?
        ORDER BY created_at DESC, id DESC
           LIMIT ?`,
    args: [conversationId, Math.min(limit, MESSAGE_PAGE_LIMIT)],
  });
  return result.rows.map(rowToMessage).reverse();
}

/**
 * Messages strictly newer than the cursor. Used by the polling endpoint —
 * a steady-state poll on a quiet conversation returns an empty array, which
 * is the cheapest possible response.
 */
export async function listMessagesSince(
  conversationId: string,
  cursor: MessageCursor,
  limit: number = MESSAGE_PAGE_LIMIT
): Promise<MessageRecord[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM messages
           WHERE conversation_id = ?
             AND (created_at > ? OR (created_at = ? AND id > ?))
        ORDER BY created_at ASC, id ASC
           LIMIT ?`,
    args: [conversationId, cursor.createdAt, cursor.createdAt, cursor.id, Math.min(limit, MESSAGE_PAGE_LIMIT)],
  });
  return result.rows.map(rowToMessage);
}

export async function findMessage(id: string): Promise<MessageRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM messages WHERE id = ?",
    args: [id],
  });
  return result.rows[0] ? rowToMessage(result.rows[0]) : null;
}

export interface CreateMessageInput {
  conversationId: string;
  senderType: SenderType;
  senderId: string;
  body: string;
}

/**
 * Insert a message and bump the conversation's last_message_at. We override
 * the column DEFAULT to use millisecond-precision (`%f`) so the cursor
 * pagination tuple `(created_at, id)` is stable across rapid bursts — without
 * ms precision, two messages inserted in the same second can be polled in an
 * order that lets one slip past a lexicographically-smaller-id cursor.
 *
 * No transaction needed — if the conversation update fails the message is
 * still visible; the inbox sort just falls back to the messages.created_at
 * subquery.
 */
export async function createMessage(input: CreateMessageInput): Promise<MessageRecord> {
  await ensureMigrated();
  const db = getDb();
  const id = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO messages (id, conversation_id, sender_type, sender_id, body, created_at)
          VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%d %H:%M:%f', 'now'))`,
    args: [id, input.conversationId, input.senderType, input.senderId, input.body],
  });
  await db.execute({
    sql: `UPDATE conversations SET last_message_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?`,
    args: [input.conversationId],
  });
  const created = await findMessage(id);
  if (!created) throw new Error("Message insert did not persist");
  return created;
}

/**
 * Hard-delete every message in a conversation and reset the metadata so the
 * thread reads as empty for both sides. Both writes go through `db.batch`
 * with write mode so a client message can't sneak in between the DELETE and
 * the UPDATE — that would leave the conversation row stale (last_message_at
 * NULL while messages exist, so the inbox would skip it). The conversation
 * row itself is kept so both sides keep the same channel.
 */
export async function clearConversationMessages(conversationId: string): Promise<number> {
  await ensureMigrated();
  const db = getDb();
  const results = await db.batch(
    [
      {
        sql: "DELETE FROM messages WHERE conversation_id = ?",
        args: [conversationId],
      },
      {
        sql: `UPDATE conversations
                 SET last_message_at = NULL,
                     last_user_read_at = NULL,
                     last_admin_read_at = NULL
               WHERE id = ?`,
        args: [conversationId],
      },
    ],
    "write"
  );
  return Number(results[0]?.rowsAffected ?? 0);
}

// ── Read receipts ──────────────────────────────────────────────────────

export async function markUserRead(conversationId: string): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: `UPDATE conversations SET last_user_read_at = datetime('now') WHERE id = ?`,
    args: [conversationId],
  });
}

export async function markAdminRead(conversationId: string): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: `UPDATE conversations SET last_admin_read_at = datetime('now') WHERE id = ?`,
    args: [conversationId],
  });
}

/**
 * Unread count from the client's perspective: admin-sent messages newer than
 * the last time the client viewed the thread. Drives the portal sidebar
 * badge — single COUNT, no cross joins.
 */
export async function getUserUnreadCount(userId: string): Promise<number> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT COUNT(*) AS c
            FROM messages m
            JOIN conversations c ON c.id = m.conversation_id
           WHERE c.user_id = ?
             AND m.sender_type = 'admin'
             AND m.deleted_at IS NULL
             AND m.created_at > COALESCE(c.last_user_read_at, '1970-01-01 00:00:00')`,
    args: [userId],
  });
  return Number(result.rows[0]?.c ?? 0);
}

/**
 * Total unread messages awaiting any admin's attention, summed across all
 * client conversations. Drives the admin sidebar badge.
 */
export async function getAdminTotalUnreadCount(): Promise<number> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute(
    `SELECT COUNT(*) AS c
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
      WHERE m.sender_type = 'client'
        AND m.deleted_at IS NULL
        AND m.created_at > COALESCE(c.last_admin_read_at, '1970-01-01 00:00:00')`
  );
  return Number(result.rows[0]?.c ?? 0);
}

// ── Inbox view (admin-side) ────────────────────────────────────────────

export interface InboxEntry {
  conversationId: string;
  userId: string;
  userDisplayName: string | null;
  userSlug: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageSenderType: SenderType | null;
  unreadCount: number;
}

/**
 * One row per conversation that has at least one message, sorted by the most
 * recent activity. The unread count is the same admin-side semantic as
 * getAdminTotalUnreadCount but per-conversation. Single query — joins users
 * for display name + slug and a correlated subquery for last-message preview.
 */
export async function listAdminInbox(): Promise<InboxEntry[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute(
    `SELECT
       c.id              AS conversation_id,
       c.user_id         AS user_id,
       u.display_name    AS user_display_name,
       u.slug            AS user_slug,
       c.last_message_at AS last_message_at,
       c.last_admin_read_at AS last_admin_read_at,
       (SELECT body FROM messages
          WHERE conversation_id = c.id AND deleted_at IS NULL
          ORDER BY created_at DESC, id DESC LIMIT 1) AS last_message_preview,
       (SELECT sender_type FROM messages
          WHERE conversation_id = c.id AND deleted_at IS NULL
          ORDER BY created_at DESC, id DESC LIMIT 1) AS last_message_sender_type,
       (SELECT COUNT(*) FROM messages m
         WHERE m.conversation_id = c.id
           AND m.sender_type = 'client'
           AND m.deleted_at IS NULL
           AND m.created_at > COALESCE(c.last_admin_read_at, '1970-01-01 00:00:00')) AS unread_count
       FROM conversations c
  LEFT JOIN users u ON u.id = c.user_id
      WHERE c.last_message_at IS NOT NULL
   ORDER BY c.last_message_at DESC
      LIMIT 200`
  );
  return result.rows.map((row) => ({
    conversationId: String(row.conversation_id),
    userId: String(row.user_id),
    userDisplayName: row.user_display_name != null ? String(row.user_display_name) : null,
    userSlug: row.user_slug != null ? String(row.user_slug) : null,
    lastMessageAt: row.last_message_at != null ? String(row.last_message_at) : null,
    lastMessagePreview: row.last_message_preview != null ? String(row.last_message_preview) : null,
    lastMessageSenderType: row.last_message_sender_type != null ? (String(row.last_message_sender_type) as SenderType) : null,
    unreadCount: Number(row.unread_count ?? 0),
  }));
}

// ── Admin presence (heartbeat-based "Team is online") ─────────────────

export async function recordAdminHeartbeat(adminId: string): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  // UPSERT so the table never grows beyond N admins.
  await db.execute({
    sql: `INSERT INTO admin_presence (admin_id, last_seen_at) VALUES (?, datetime('now'))
          ON CONFLICT(admin_id) DO UPDATE SET last_seen_at = datetime('now')`,
    args: [adminId],
  });
}

export interface PresenceSnapshot {
  online: boolean;
  count: number;
  /** Latest admin heartbeat across all online admins, or null when nobody's online. */
  lastSeenAt: string | null;
}

export async function getAdminPresence(): Promise<PresenceSnapshot> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT COUNT(*) AS c, MAX(last_seen_at) AS last_seen_at
            FROM admin_presence
           WHERE last_seen_at >= datetime('now', ?)`,
    args: [`-${PRESENCE_FRESH_SECONDS} seconds`],
  });
  const row = result.rows[0];
  const count = Number(row?.c ?? 0);
  return {
    online: count > 0,
    count,
    lastSeenAt: row?.last_seen_at != null ? String(row.last_seen_at) : null,
  };
}

// ── Identity resolver: hydrate per-message sender names ───────────────

export interface SenderInfo {
  id: string;
  type: SenderType;
  displayName: string | null;
  avatarPath: string | null;
}

/**
 * Resolve sender display names + avatars for a batch of messages. Two queries
 * (one per role) regardless of message count; keeps message-list rendering
 * O(1) DB calls per page.
 */
export async function resolveSenders(messages: MessageRecord[]): Promise<Record<string, SenderInfo>> {
  if (messages.length === 0) return {};
  await ensureMigrated();
  const db = getDb();

  const adminIds = new Set<string>();
  const clientIds = new Set<string>();
  for (const m of messages) {
    if (m.senderType === "admin") adminIds.add(m.senderId);
    else if (m.senderType === "client") clientIds.add(m.senderId);
  }

  const out: Record<string, SenderInfo> = {};

  if (adminIds.size > 0) {
    const ids = [...adminIds];
    const placeholders = ids.map(() => "?").join(",");
    const result = await db.execute({
      sql: `SELECT id, display_name, username, avatar_path FROM admins WHERE id IN (${placeholders})`,
      args: ids,
    });
    for (const row of result.rows) {
      const id = String(row.id);
      out[id] = {
        id,
        type: "admin",
        displayName: row.display_name != null ? String(row.display_name) : (row.username != null ? String(row.username) : null),
        avatarPath: row.avatar_path != null ? String(row.avatar_path) : null,
      };
    }
  }

  if (clientIds.size > 0) {
    const ids = [...clientIds];
    const placeholders = ids.map(() => "?").join(",");
    const result = await db.execute({
      sql: `SELECT id, display_name, logo_path FROM users WHERE id IN (${placeholders})`,
      args: ids,
    });
    for (const row of result.rows) {
      const id = String(row.id);
      out[id] = {
        id,
        type: "client",
        displayName: row.display_name != null ? String(row.display_name) : null,
        avatarPath: row.logo_path != null ? String(row.logo_path) : null,
      };
    }
  }

  return out;
}
