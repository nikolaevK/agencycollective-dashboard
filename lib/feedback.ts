import crypto from "crypto";
import { getDb, ensureMigrated } from "./db";
import type { Row } from "@libsql/client";

export const FEEDBACK_BODY_MAX = 5_000;
export const REPLY_BODY_MAX = 5_000;

export type Sentiment = "happy" | "neutral" | "concerned";
export const SENTIMENTS: Sentiment[] = ["happy", "neutral", "concerned"];

export type FeedbackStatus = "open" | "in_progress" | "resolved";
export const FEEDBACK_STATUSES: FeedbackStatus[] = ["open", "in_progress", "resolved"];

export function isSentiment(v: unknown): v is Sentiment {
  return typeof v === "string" && (SENTIMENTS as string[]).includes(v);
}
export function isFeedbackStatus(v: unknown): v is FeedbackStatus {
  return typeof v === "string" && (FEEDBACK_STATUSES as string[]).includes(v);
}

export interface FeedbackRecord {
  id: string;
  userId: string;
  sentiment: Sentiment;
  rating: number;
  body: string;
  status: FeedbackStatus;
  createdAt: string;
}

export interface FeedbackReplyRecord {
  id: string;
  feedbackId: string;
  adminId: string;
  adminDisplayName: string | null;
  adminAvatarPath: string | null;
  body: string;
  createdAt: string;
}

function rowToFeedback(row: Row): FeedbackRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    sentiment: String(row.sentiment) as Sentiment,
    rating: Number(row.rating),
    body: String(row.body ?? ""),
    status: String(row.status) as FeedbackStatus,
    createdAt: String(row.created_at),
  };
}

function rowToReply(row: Row): FeedbackReplyRecord {
  return {
    id: String(row.id),
    feedbackId: String(row.feedback_id),
    adminId: String(row.admin_id),
    adminDisplayName: row.admin_display_name != null ? String(row.admin_display_name) : null,
    adminAvatarPath: row.admin_avatar_path != null ? String(row.admin_avatar_path) : null,
    body: String(row.body ?? ""),
    createdAt: String(row.created_at),
  };
}

export interface CreateFeedbackInput {
  userId: string;
  sentiment: Sentiment;
  rating: number;
  body: string;
}

export async function createFeedback(input: CreateFeedbackInput): Promise<FeedbackRecord> {
  await ensureMigrated();
  const db = getDb();
  const id = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO feedback (id, user_id, sentiment, rating, body) VALUES (?, ?, ?, ?, ?)`,
    args: [id, input.userId, input.sentiment, input.rating, input.body],
  });
  const created = await findFeedback(id);
  if (!created) throw new Error("Feedback insert did not persist");
  return created;
}

export async function findFeedback(id: string): Promise<FeedbackRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM feedback WHERE id = ?",
    args: [id],
  });
  return result.rows[0] ? rowToFeedback(result.rows[0]) : null;
}

/** Feedback for one client, newest first. */
export async function listFeedbackByUser(userId: string): Promise<FeedbackRecord[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM feedback WHERE user_id = ? ORDER BY created_at DESC LIMIT 200`,
    args: [userId],
  });
  return result.rows.map(rowToFeedback);
}

export interface AdminFeedbackEntry extends FeedbackRecord {
  userDisplayName: string | null;
  userSlug: string | null;
  replyCount: number;
}

/**
 * Admin-facing list across all clients. Joined with the user row for display
 * name + slug (so the table doesn't need a second fetch) and a correlated
 * reply count for the badge.
 */
export async function listAllFeedback(filter?: {
  status?: FeedbackStatus;
  userId?: string;
}): Promise<AdminFeedbackEntry[]> {
  await ensureMigrated();
  const db = getDb();
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (filter?.status) {
    where.push("f.status = ?");
    args.push(filter.status);
  }
  if (filter?.userId) {
    where.push("f.user_id = ?");
    args.push(filter.userId);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const result = await db.execute({
    sql: `SELECT
            f.*,
            u.display_name AS user_display_name,
            u.slug         AS user_slug,
            (SELECT COUNT(*) FROM feedback_replies r WHERE r.feedback_id = f.id) AS reply_count
            FROM feedback f
       LEFT JOIN users u ON u.id = f.user_id
            ${whereSql}
        ORDER BY f.created_at DESC
           LIMIT 500`,
    args,
  });
  return result.rows.map((row) => ({
    ...rowToFeedback(row),
    userDisplayName: row.user_display_name != null ? String(row.user_display_name) : null,
    userSlug: row.user_slug != null ? String(row.user_slug) : null,
    replyCount: Number(row.reply_count ?? 0),
  }));
}

export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: `UPDATE feedback SET status = ? WHERE id = ?`,
    args: [status, id],
  });
  return (result.rowsAffected ?? 0) > 0;
}

/**
 * Hard-delete a feedback row and all of its replies, atomically. We delete
 * replies explicitly because per CLAUDE.md libSQL's FK cascade is not
 * guaranteed; we wrap both writes in a batch so a partial failure can't leave
 * orphaned replies behind, and so a concurrent reply insert can't race in
 * between (the reply would survive a vanished feedback parent).
 */
export async function deleteFeedback(id: string): Promise<{ deleted: boolean; repliesDeleted: number }> {
  await ensureMigrated();
  const db = getDb();
  const results = await db.batch(
    [
      {
        sql: "DELETE FROM feedback_replies WHERE feedback_id = ?",
        args: [id],
      },
      {
        sql: "DELETE FROM feedback WHERE id = ?",
        args: [id],
      },
    ],
    "write"
  );
  return {
    deleted: (results[1]?.rowsAffected ?? 0) > 0,
    repliesDeleted: Number(results[0]?.rowsAffected ?? 0),
  };
}

// ── Replies ───────────────────────────────────────────────────────────

export interface CreateReplyInput {
  feedbackId: string;
  adminId: string;
  body: string;
}

export async function createReply(input: CreateReplyInput): Promise<FeedbackReplyRecord> {
  await ensureMigrated();
  const db = getDb();
  const id = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO feedback_replies (id, feedback_id, admin_id, body) VALUES (?, ?, ?, ?)`,
    args: [id, input.feedbackId, input.adminId, input.body],
  });
  const fetched = await findReply(id);
  if (!fetched) throw new Error("Reply insert did not persist");
  return fetched;
}

export async function findReply(id: string): Promise<FeedbackReplyRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT r.*,
                 a.display_name AS admin_display_name,
                 a.avatar_path  AS admin_avatar_path
            FROM feedback_replies r
       LEFT JOIN admins a ON a.id = r.admin_id
           WHERE r.id = ?`,
    args: [id],
  });
  return result.rows[0] ? rowToReply(result.rows[0]) : null;
}

/** All replies for a single feedback row, oldest first. */
export async function listRepliesForFeedback(feedbackId: string): Promise<FeedbackReplyRecord[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT r.*,
                 a.display_name AS admin_display_name,
                 a.avatar_path  AS admin_avatar_path
            FROM feedback_replies r
       LEFT JOIN admins a ON a.id = r.admin_id
           WHERE r.feedback_id = ?
        ORDER BY r.created_at ASC, r.id ASC
           LIMIT 200`,
    args: [feedbackId],
  });
  return result.rows.map(rowToReply);
}

/**
 * Hydrate a list of feedback rows with their replies, indexed by feedback id.
 * One query regardless of feedback count.
 */
export async function getRepliesForFeedbackIds(feedbackIds: string[]): Promise<Record<string, FeedbackReplyRecord[]>> {
  if (feedbackIds.length === 0) return {};
  await ensureMigrated();
  const db = getDb();
  const placeholders = feedbackIds.map(() => "?").join(",");
  const result = await db.execute({
    sql: `SELECT r.*,
                 a.display_name AS admin_display_name,
                 a.avatar_path  AS admin_avatar_path
            FROM feedback_replies r
       LEFT JOIN admins a ON a.id = r.admin_id
           WHERE r.feedback_id IN (${placeholders})
        ORDER BY r.created_at ASC, r.id ASC`,
    args: feedbackIds,
  });
  const out: Record<string, FeedbackReplyRecord[]> = {};
  for (const row of result.rows) {
    const reply = rowToReply(row);
    (out[reply.feedbackId] ??= []).push(reply);
  }
  return out;
}
