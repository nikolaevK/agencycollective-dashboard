import { randomUUID } from "crypto";
import { getDb, ensureMigrated } from "./db";
import type { Row, InValue } from "@libsql/client";
import type { ClientDirectoryRow } from "./clientDirectory";
import { listTeamMembers } from "./teamMembers";
import { parseTaskPriority, utcNowStamp, LANE_SPACING } from "./teamTasks";

// ---------------------------------------------------------------------------
// Team action items — the inbox half of the Team hub (team_action_items, see
// lib/db.ts). An item is a report routed to ONE member: a Slack thread or
// dashboard note relayed by the external API/MCP agent, or a system sweep
// finding. Creating an item auto-creates a linked team_tasks row; the two stay
// in two-way sync (solve ⇄ complete).
//
// Sync discipline: the sync helpers write the OTHER side with raw SQL inside
// one db.batch — never through the high-level task/item functions — so
// task→item→task recursion is structurally impossible and each flip is atomic.
// ---------------------------------------------------------------------------

export const ACTION_SOURCE_TYPES = ["slack", "dashboard", "system"] as const;
export type ActionSourceType = (typeof ACTION_SOURCE_TYPES)[number];

export function parseActionSourceType(value: unknown): ActionSourceType | null {
  const s = String(value ?? "").trim();
  return (ACTION_SOURCE_TYPES as readonly string[]).includes(s)
    ? (s as ActionSourceType)
    : null;
}

export interface TeamActionItemRecord {
  id: string;
  adminId: string;
  clientId: string | null;
  taskId: string | null;
  sourceType: ActionSourceType;
  sourceChannel: string | null;
  authorLabel: string | null;
  externalTs: string | null;
  body: string;
  status: "unsolved" | "solved";
  solvedAt: string | null;
  solvedBy: string | null; // admin id | 'task' | 'system'
  dedupKey: string | null;
  createdAt: string;
  updatedAt: string;
  // Joined from the linked task on read:
  linkedTask: { id: string; title: string; status: string } | null;
}

const MAX_BODY_LEN = 5_000;
const MAX_LABEL_LEN = 200;
const TASK_TITLE_FROM_BODY = 120;

function isNoSuchTable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /no such table/i.test(msg);
}

function rowToItem(row: Row): TeamActionItemRecord {
  const sourceType = parseActionSourceType(row.source_type) ?? "dashboard";
  return {
    id: String(row.id),
    adminId: String(row.admin_id),
    clientId: row.client_id != null ? String(row.client_id) : null,
    taskId: row.task_id != null ? String(row.task_id) : null,
    sourceType,
    sourceChannel: row.source_channel != null ? String(row.source_channel) : null,
    authorLabel: row.author_label != null ? String(row.author_label) : null,
    externalTs: row.external_ts != null ? String(row.external_ts) : null,
    body: String(row.body ?? ""),
    status: String(row.status) === "solved" ? "solved" : "unsolved",
    solvedAt: row.solved_at != null ? String(row.solved_at) : null,
    solvedBy: row.solved_by != null ? String(row.solved_by) : null,
    dedupKey: row.dedup_key != null ? String(row.dedup_key) : null,
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
    linkedTask:
      row.lt_id != null
        ? {
            id: String(row.lt_id),
            title: String(row.lt_title ?? ""),
            status: String(row.lt_status ?? "todo"),
          }
        : null,
  };
}

const ITEM_SELECT = `
  SELECT ai.*, t.id AS lt_id, t.title AS lt_title, t.status AS lt_status
  FROM team_action_items ai
  LEFT JOIN team_tasks t ON t.id = ai.task_id
`;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export interface ListActionItemsFilter {
  adminId?: string;
  status?: "unsolved" | "solved";
  clientId?: string;
  limit?: number;
  offset?: number;
}

export async function listActionItems(
  filter: ListActionItemsFilter = {}
): Promise<{ items: TeamActionItemRecord[]; total: number }> {
  await ensureMigrated();
  const db = getDb();

  const where: string[] = [];
  const args: InValue[] = [];
  if (filter.adminId) {
    where.push("ai.admin_id = ?");
    args.push(filter.adminId);
  }
  if (filter.status) {
    where.push("ai.status = ?");
    args.push(filter.status);
  }
  if (filter.clientId) {
    where.push("ai.client_id = ?");
    args.push(filter.clientId);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(Math.max(Number(filter.limit ?? 100), 1), 500);
  const offset = Math.max(Number(filter.offset ?? 0), 0);

  try {
    const [rows, count] = await Promise.all([
      db.execute({
        sql: `${ITEM_SELECT} ${whereSql}
              ORDER BY ai.status DESC, ai.created_at DESC
              LIMIT ? OFFSET ?`,
        args: [...args, limit, offset],
      }),
      db.execute({
        sql: `SELECT COUNT(*) AS n FROM team_action_items ai ${whereSql}`,
        args,
      }),
    ]);
    return { items: rows.rows.map(rowToItem), total: Number(count.rows[0]?.n ?? 0) };
  } catch (err) {
    if (isNoSuchTable(err)) return { items: [], total: 0 };
    throw err;
  }
}

export async function getActionItem(id: string): Promise<TeamActionItemRecord | null> {
  await ensureMigrated();
  const db = getDb();
  try {
    const result = await db.execute({
      sql: `${ITEM_SELECT} WHERE ai.id = ?`,
      args: [id],
    });
    return result.rows[0] ? rowToItem(result.rows[0]) : null;
  } catch (err) {
    if (isNoSuchTable(err)) return null;
    throw err;
  }
}

/**
 * Unsolved counts per admin (one GROUP BY) — Team home rollups. Pass
 * `adminId` to scope the scan to one member (the single-member hub).
 */
export async function unsolvedCountsByAdmin(
  adminId?: string
): Promise<Map<string, number>> {
  await ensureMigrated();
  const db = getDb();
  const map = new Map<string, number>();
  try {
    const result = await db.execute({
      sql: `SELECT admin_id, COUNT(*) AS n FROM team_action_items
            WHERE status = 'unsolved' ${adminId ? "AND admin_id = ?" : ""}
            GROUP BY admin_id`,
      args: adminId ? [adminId] : [],
    });
    for (const row of result.rows) {
      map.set(String(row.admin_id), Number(row.n ?? 0));
    }
  } catch (err) {
    if (!isNoSuchTable(err)) throw err;
  }
  return map;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface CreateActionItemInput {
  adminId: string;
  body: string;
  clientId?: string | null;
  sourceType?: ActionSourceType;
  sourceChannel?: string | null;
  authorLabel?: string | null;
  externalTs?: string | null;
  /** Override for the auto-created task's title (defaults to the body head). */
  taskTitle?: string | null;
  dueDate?: string | null;
  priority?: string | null;
}

/**
 * Create an action item + its linked task atomically (one db.batch). The task
 * carries source 'action_item' ('system' for sweep items), the same client,
 * and a title derived from the body unless overridden.
 */
export async function createActionItem(
  input: CreateActionItemInput,
  actor: { id: string; name: string }
): Promise<TeamActionItemRecord> {
  await ensureMigrated();
  const db = getDb();
  const itemId = randomUUID();
  const taskId = randomUUID();
  const body = input.body.trim().slice(0, MAX_BODY_LEN);
  const sourceType = input.sourceType ?? "dashboard";
  const title = (input.taskTitle?.trim() || body).slice(0, TASK_TITLE_FROM_BODY);
  const priority = parseTaskPriority(input.priority) ?? "normal";
  const dueDate =
    input.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) ? input.dueDate : null;

  await db.batch(
    [
      {
        sql: `INSERT INTO team_tasks
                (id, admin_id, client_id, title, description, status, priority,
                 due_date, source, sort_pos, created_by, created_by_name)
              VALUES (?, ?, ?, ?, ?, 'todo', ?, ?, ?,
                      COALESCE((SELECT MAX(sort_pos) FROM team_tasks
                                WHERE admin_id = ? AND status = 'todo'), 0) + ${LANE_SPACING},
                      ?, ?)`,
        args: [
          taskId,
          input.adminId,
          input.clientId ?? null,
          title,
          body,
          priority,
          dueDate,
          sourceType === "system" ? "system" : "action_item",
          input.adminId,
          actor.id,
          actor.name,
        ],
      },
      {
        sql: `INSERT INTO team_action_items
                (id, admin_id, client_id, task_id, source_type, source_channel,
                 author_label, external_ts, body)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          itemId,
          input.adminId,
          input.clientId ?? null,
          taskId,
          sourceType,
          input.sourceChannel?.trim().slice(0, MAX_LABEL_LEN) ?? null,
          input.authorLabel?.trim().slice(0, MAX_LABEL_LEN) ?? null,
          input.externalTs?.trim().slice(0, 40) ?? null,
          body,
        ],
      },
    ],
    "write"
  );
  const created = await getActionItem(itemId);
  if (!created) throw new Error("Action item insert did not persist");
  return created;
}

/**
 * Full ownership transfer to another admin's inbox. The linked task moves
 * with it in the SAME atomic batch — raw SQL on the task side by design (see
 * module header) — landing at the bottom of the target hub's lane for its
 * current status (the task row still holds its old admin_id when the
 * subquery evaluates, so it never counts itself).
 */
export async function reassignActionItem(
  id: string,
  toAdminId: string
): Promise<TeamActionItemRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const item = await getActionItem(id);
  if (!item) return null;
  if (item.adminId === toAdminId) return item;
  const statements: { sql: string; args: InValue[] }[] = [
    {
      sql: `UPDATE team_action_items SET admin_id = ?, updated_at = datetime('now')
            WHERE id = ?`,
      args: [toAdminId, id],
    },
  ];
  if (item.taskId) {
    // Bound status from the joined linkedTask (mirrors reassignTask's shape).
    statements.push({
      sql: `UPDATE team_tasks
            SET admin_id = ?,
                sort_pos = COALESCE((SELECT MAX(sort_pos) FROM team_tasks
                                     WHERE admin_id = ? AND status = ?), 0) + ${LANE_SPACING},
                updated_at = datetime('now')
            WHERE id = ?`,
      args: [toAdminId, toAdminId, item.linkedTask?.status ?? "todo", item.taskId],
    });
  }
  await db.batch(statements, "write");
  return getActionItem(id);
}

/**
 * Mark solved and complete the linked task in one atomic batch. Raw SQL on the
 * task side by design (see module header). Idempotent.
 */
export async function solveActionItem(
  id: string,
  solvedBy: string
): Promise<TeamActionItemRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const item = await getActionItem(id);
  if (!item) return null;
  const now = utcNowStamp();
  const statements: { sql: string; args: InValue[] }[] = [
    {
      sql: `UPDATE team_action_items
            SET status = 'solved', solved_at = ?, solved_by = ?, updated_at = datetime('now')
            WHERE id = ? AND status = 'unsolved'`,
      args: [now, solvedBy, id],
    },
  ];
  if (item.taskId) {
    statements.push({
      sql: `UPDATE team_tasks
            SET status = 'complete', completed_at = ?, updated_at = datetime('now')
            WHERE id = ? AND status != 'complete'`,
      args: [now, item.taskId],
    });
  }
  await db.batch(statements, "write");
  return getActionItem(id);
}

/** Reopen a solved item and its linked task (complete → todo). Atomic. */
export async function unsolveActionItem(
  id: string
): Promise<TeamActionItemRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const item = await getActionItem(id);
  if (!item) return null;
  const statements: { sql: string; args: InValue[] }[] = [
    {
      sql: `UPDATE team_action_items
            SET status = 'unsolved', solved_at = NULL, solved_by = NULL,
                updated_at = datetime('now')
            WHERE id = ? AND status = 'solved'`,
      args: [id],
    },
  ];
  if (item.taskId) {
    statements.push({
      sql: `UPDATE team_tasks
            SET status = 'todo', completed_at = NULL, updated_at = datetime('now')
            WHERE id = ? AND status = 'complete'`,
      args: [item.taskId],
    });
  }
  await db.batch(statements, "write");
  return getActionItem(id);
}

/**
 * Task-side sync hook — routes call this AFTER a task status change
 * (updateTask/moveTask). Task completed → solve its unsolved item
 * (solved_by='task'); task reopened → un-solve only items the task itself
 * solved (a human's explicit "Mark Solved" is never reverted by a task edit).
 */
export async function syncActionItemForTask(
  taskId: string,
  newStatus: string
): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  try {
    if (newStatus === "complete") {
      await db.execute({
        sql: `UPDATE team_action_items
              SET status = 'solved', solved_at = ?, solved_by = 'task',
                  updated_at = datetime('now')
              WHERE task_id = ? AND status = 'unsolved'`,
        args: [utcNowStamp(), taskId],
      });
    } else {
      await db.execute({
        sql: `UPDATE team_action_items
              SET status = 'unsolved', solved_at = NULL, solved_by = NULL,
                  updated_at = datetime('now')
              WHERE task_id = ? AND status = 'solved' AND solved_by = 'task'`,
        args: [taskId],
      });
    }
  } catch (err) {
    if (!isNoSuchTable(err)) throw err;
  }
}

export async function deleteActionItem(id: string): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const item = await getActionItem(id);
  if (!item) return false;
  // The linked task survives (it may have accrued comments/checklist work);
  // it just loses its inbox entry.
  await db.execute({ sql: "DELETE FROM team_action_items WHERE id = ?", args: [id] });
  return true;
}

// ---------------------------------------------------------------------------
// System sweep — data-quality findings become action items routed to the
// book-attribution members (the COO view). Idempotent via dedup_key; a later
// sweep auto-solves items whose condition has cleared. Throttled per process
// and try/caught by the caller — a read path must never fail because of this.
// ---------------------------------------------------------------------------

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let lastSweepAt = 0;

export function resetSweepThrottleForTests(): void {
  lastSweepAt = 0;
}

export async function runTeamSystemSweep(rows: ClientDirectoryRow[]): Promise<void> {
  const now = Date.now();
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;

  await ensureMigrated();
  const db = getDb();

  const members = await listTeamMembers();
  const bookMembers = members.filter((m) => m.attribution === "book");

  // Rule: unassigned_team — an active client with no team assigned at all.
  const unassigned = rows.filter(
    (r) => r.status === "active" && r.team.length === 0
  );

  const statements: { sql: string; args: InValue[] }[] = [];

  for (const client of unassigned) {
    for (const member of bookMembers) {
      const dedupKey = `unassigned_team:${client.id}:${member.adminId}`;
      const itemId = randomUUID();
      const taskId = randomUUID();
      const body = `${client.displayName} is active but has no lead, media buyer, or CSM assigned in the Client Directory.`;
      // Item first (INSERT OR IGNORE on dedup_key), then the task only if OUR
      // item row actually landed — a concurrent sweep's loser creates neither.
      statements.push(
        {
          sql: `INSERT OR IGNORE INTO team_action_items
                  (id, admin_id, client_id, task_id, source_type, source_channel,
                   author_label, body, dedup_key)
                VALUES (?, ?, ?, ?, 'system', 'Directory audit', 'System', ?, ?)`,
          args: [itemId, member.adminId, client.id, taskId, body, dedupKey],
        },
        {
          sql: `INSERT INTO team_tasks
                  (id, admin_id, client_id, title, description, status, priority,
                   source, sort_pos, created_by, created_by_name)
                SELECT ?, ?, ?, ?, ?, 'todo', 'high', 'system',
                       COALESCE((SELECT MAX(sort_pos) FROM team_tasks
                                 WHERE admin_id = ? AND status = 'todo'), 0) + ${LANE_SPACING},
                       'system', 'System'
                WHERE EXISTS (SELECT 1 FROM team_action_items WHERE id = ?)`,
          args: [
            taskId,
            member.adminId,
            client.id,
            `Assign a team — ${client.displayName}`.slice(0, 300),
            body,
            member.adminId,
            itemId,
          ],
        }
      );
    }
  }

  if (statements.length > 0) {
    await db.batch(statements, "write");
  }

  // Auto-resolve pass: unassigned_team items whose client now has a team, is
  // no longer active, or is gone. Unsolved ones are solved (solved_by='system')
  // and their linked task completed. Every cleared item — auto- OR previously
  // human-solved — also FREES its dedup_key, so the same condition recurring
  // later creates a fresh item instead of being swallowed by INSERT OR IGNORE
  // forever. A human-solved item whose condition still persists keeps its key
  // (the dismissal holds until the condition actually clears).
  try {
    const open = await db.execute(
      `SELECT id, status, client_id, task_id FROM team_action_items
       WHERE dedup_key LIKE 'unassigned_team:%'`
    );
    const stillUnassigned = new Set(unassigned.map((c) => c.id));
    const nowStamp = utcNowStamp();
    const resolves: { sql: string; args: InValue[] }[] = [];
    for (const row of open.rows) {
      const clientId = row.client_id != null ? String(row.client_id) : null;
      if (clientId && stillUnassigned.has(clientId)) continue;
      if (String(row.status) === "unsolved") {
        resolves.push({
          sql: `UPDATE team_action_items
                SET status = 'solved', solved_at = ?, solved_by = 'system',
                    dedup_key = NULL, updated_at = datetime('now')
                WHERE id = ?`,
          args: [nowStamp, String(row.id)],
        });
        if (row.task_id != null) {
          resolves.push({
            sql: `UPDATE team_tasks
                  SET status = 'complete', completed_at = ?, updated_at = datetime('now')
                  WHERE id = ? AND status != 'complete'`,
            args: [nowStamp, String(row.task_id)],
          });
        }
      } else {
        resolves.push({
          sql: `UPDATE team_action_items
                SET dedup_key = NULL, updated_at = datetime('now')
                WHERE id = ?`,
          args: [String(row.id)],
        });
      }
    }
    if (resolves.length > 0) {
      await db.batch(resolves, "write");
    }
  } catch (err) {
    if (!isNoSuchTable(err)) throw err;
  }
}
