import { randomUUID } from "crypto";
import { getDb, ensureMigrated } from "./db";
import type { Row, InValue } from "@libsql/client";

// ---------------------------------------------------------------------------
// Team tasks — the project-management half of the Team hub (team_tasks +
// team_task_comments, see lib/db.ts). Every task is assigned to ONE individual
// admin. Status/priority vocabularies are FIXED (they drive the Kanban columns
// and the action-item sync semantics — 'complete' is load-bearing).
//
// Board ordering: sort_pos spaced floats within an (admin_id, status) lane.
// New task = max+1024; a drop takes the midpoint of its neighbors (computed
// SERVER-side from afterTaskId so concurrent clients can't fabricate
// positions); when a gap collapses the lane rebalances to (i+1)*1024.
// ---------------------------------------------------------------------------

export const TASK_STATUSES = ["todo", "in_progress", "review", "complete"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Human labels for the activity trail (UI labels live in components/team). */
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  review: "Review",
  complete: "Complete",
};

export const TASK_PRIORITIES = ["urgent", "high", "normal", "low"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_SOURCES = ["manual", "action_item", "system"] as const;
export type TaskSource = (typeof TASK_SOURCES)[number];

export function parseTaskStatus(value: unknown): TaskStatus | null {
  const s = String(value ?? "").trim();
  return (TASK_STATUSES as readonly string[]).includes(s) ? (s as TaskStatus) : null;
}

export function parseTaskPriority(value: unknown): TaskPriority | null {
  const s = String(value ?? "").trim();
  return (TASK_PRIORITIES as readonly string[]).includes(s) ? (s as TaskPriority) : null;
}

export interface TaskChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface TeamTaskRecord {
  id: string;
  adminId: string;
  clientId: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null; // yyyy-mm-dd (business-TZ calendar day)
  source: TaskSource;
  lineup: boolean;
  checklist: TaskChecklistItem[];
  sortPos: number;
  completedAt: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeamTaskComment {
  id: string;
  taskId: string;
  adminId: string | null;
  authorName: string;
  body: string;
  /** 'comment' = human note; 'activity' = system-recorded status trail. */
  kind: "comment" | "activity";
  createdAt: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TITLE_LEN = 300;
const MAX_DESC_LEN = 10_000;
const MAX_CHECKLIST_ITEMS = 50;
const MAX_CHECKLIST_TEXT = 300;
const MAX_COMMENT_LEN = 5_000;
/** Board lane gap — exported so teamActionItems' raw-SQL task writes stay in sync. */
export const LANE_SPACING = 1024;
const MIN_GAP = 1e-6;

function isNoSuchTable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /no such table/i.test(msg);
}

/**
 * UTC "YYYY-MM-DD HH:MM:SS" — the same format SQLite's datetime('now')
 * produces, so completed_at/solved_at stay comparable with the
 * datetime('now')-defaulted created_at/updated_at columns.
 */
export function utcNowStamp(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

/** Defensive JSON checklist parse — bad/legacy data degrades to []. */
export function parseChecklist(raw: unknown): TaskChecklistItem[] {
  if (raw == null) return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    const out: TaskChecklistItem[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const text = String((item as Record<string, unknown>).text ?? "").trim();
      if (!text) continue;
      out.push({
        id: String((item as Record<string, unknown>).id ?? randomUUID()),
        text: text.slice(0, MAX_CHECKLIST_TEXT),
        done: Boolean((item as Record<string, unknown>).done),
      });
      if (out.length >= MAX_CHECKLIST_ITEMS) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Coerce an untrusted checklist body into the stored shape (ids preserved). */
export function sanitizeChecklist(value: unknown): TaskChecklistItem[] {
  if (!Array.isArray(value)) return [];
  const out: TaskChecklistItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const text = String((item as Record<string, unknown>).text ?? "").trim();
    if (!text) continue;
    const rawId = (item as Record<string, unknown>).id;
    out.push({
      id: typeof rawId === "string" && rawId ? rawId.slice(0, 64) : randomUUID(),
      text: text.slice(0, MAX_CHECKLIST_TEXT),
      done: Boolean((item as Record<string, unknown>).done),
    });
    if (out.length >= MAX_CHECKLIST_ITEMS) break;
  }
  return out;
}

function rowToTask(row: Row): TeamTaskRecord {
  return {
    id: String(row.id),
    adminId: String(row.admin_id),
    clientId: row.client_id != null ? String(row.client_id) : null,
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    status: parseTaskStatus(row.status) ?? "todo",
    priority: parseTaskPriority(row.priority) ?? "normal",
    dueDate: row.due_date != null ? String(row.due_date) : null,
    source: (TASK_SOURCES as readonly string[]).includes(String(row.source))
      ? (String(row.source) as TaskSource)
      : "manual",
    lineup: Number(row.lineup ?? 0) === 1,
    checklist: parseChecklist(row.checklist),
    sortPos: Number(row.sort_pos ?? 0),
    completedAt: row.completed_at != null ? String(row.completed_at) : null,
    createdBy: row.created_by != null ? String(row.created_by) : null,
    createdByName: row.created_by_name != null ? String(row.created_by_name) : null,
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export interface ListTasksFilter {
  adminId?: string;
  status?: TaskStatus;
  clientId?: string;
  search?: string;
  dueBefore?: string; // yyyy-mm-dd inclusive
  limit?: number;
  offset?: number;
}

export async function listTasks(
  filter: ListTasksFilter = {}
): Promise<{ tasks: TeamTaskRecord[]; total: number }> {
  await ensureMigrated();
  const db = getDb();

  const where: string[] = [];
  const args: InValue[] = [];
  if (filter.adminId) {
    where.push("admin_id = ?");
    args.push(filter.adminId);
  }
  if (filter.status) {
    where.push("status = ?");
    args.push(filter.status);
  }
  if (filter.clientId) {
    where.push("client_id = ?");
    args.push(filter.clientId);
  }
  if (filter.search) {
    where.push("(title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')");
    const like = `%${filter.search.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    args.push(like, like);
  }
  if (filter.dueBefore && ISO_DATE_RE.test(filter.dueBefore)) {
    where.push("due_date IS NOT NULL AND due_date <= ?");
    args.push(filter.dueBefore);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const limit = Math.min(Math.max(Number(filter.limit ?? 200), 1), 500);
  const offset = Math.max(Number(filter.offset ?? 0), 0);

  try {
    const [rows, count] = await Promise.all([
      db.execute({
        sql: `SELECT * FROM team_tasks ${whereSql}
              ORDER BY status, sort_pos, created_at
              LIMIT ? OFFSET ?`,
        args: [...args, limit, offset],
      }),
      db.execute({
        sql: `SELECT COUNT(*) AS n FROM team_tasks ${whereSql}`,
        args,
      }),
    ]);
    return {
      tasks: rows.rows.map(rowToTask),
      total: Number(count.rows[0]?.n ?? 0),
    };
  } catch (err) {
    if (isNoSuchTable(err)) return { tasks: [], total: 0 };
    throw err;
  }
}

export async function getTask(id: string): Promise<TeamTaskRecord | null> {
  await ensureMigrated();
  const db = getDb();
  try {
    const result = await db.execute({
      sql: "SELECT * FROM team_tasks WHERE id = ?",
      args: [id],
    });
    return result.rows[0] ? rowToTask(result.rows[0]) : null;
  } catch (err) {
    if (isNoSuchTable(err)) return null;
    throw err;
  }
}

export interface TaskStats {
  total: number;
  open: number; // todo
  inProgress: number;
  review: number;
  done: number;
  overdue: number; // due_date < today AND not complete
  dueToday: number;
  dueInWindow: number; // today < due <= windowEnd, not complete
}

export function emptyTaskStats(): TaskStats {
  return {
    total: 0,
    open: 0,
    inProgress: 0,
    review: 0,
    done: 0,
    overdue: 0,
    dueToday: 0,
    dueInWindow: 0,
  };
}

/**
 * Per-admin task stats in one GROUP BY — powers the Team home member cards and
 * KPI strip without loading every task row. Day comparisons are string ymd in
 * the business TZ (callers pass businessTodayYmd()); `windowEndYmd` is the
 * caller's timeframe window end (today/Sunday/month-end), so `dueInWindow`
 * always matches the timeframe being displayed. Pass `adminId` to scope the
 * scan to one member (the single-member hub).
 */
export async function taskStatsByAdmin(
  todayYmd: string,
  windowEndYmd: string,
  adminId?: string
): Promise<Map<string, TaskStats>> {
  await ensureMigrated();
  const db = getDb();
  const map = new Map<string, TaskStats>();
  try {
    const result = await db.execute({
      sql: `SELECT admin_id,
              COUNT(*) AS total,
              SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END) AS open,
              SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
              SUM(CASE WHEN status = 'review' THEN 1 ELSE 0 END) AS review,
              SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) AS done,
              SUM(CASE WHEN status != 'complete' AND due_date IS NOT NULL AND due_date < ? THEN 1 ELSE 0 END) AS overdue,
              SUM(CASE WHEN status != 'complete' AND due_date = ? THEN 1 ELSE 0 END) AS due_today,
              SUM(CASE WHEN status != 'complete' AND due_date > ? AND due_date <= ? THEN 1 ELSE 0 END) AS due_in_window
            FROM team_tasks
            ${adminId ? "WHERE admin_id = ?" : ""}
            GROUP BY admin_id`,
      args: adminId
        ? [todayYmd, todayYmd, todayYmd, windowEndYmd, adminId]
        : [todayYmd, todayYmd, todayYmd, windowEndYmd],
    });
    for (const row of result.rows) {
      map.set(String(row.admin_id), {
        total: Number(row.total ?? 0),
        open: Number(row.open ?? 0),
        inProgress: Number(row.in_progress ?? 0),
        review: Number(row.review ?? 0),
        done: Number(row.done ?? 0),
        overdue: Number(row.overdue ?? 0),
        dueToday: Number(row.due_today ?? 0),
        dueInWindow: Number(row.due_in_window ?? 0),
      });
    }
  } catch (err) {
    if (!isNoSuchTable(err)) throw err;
  }
  return map;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface CreateTaskInput {
  adminId: string;
  title: string;
  description?: string;
  clientId?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  source?: TaskSource;
  lineup?: boolean;
  checklist?: TaskChecklistItem[];
  createdBy?: string | null;
  createdByName?: string | null;
}

export async function createTask(input: CreateTaskInput): Promise<TeamTaskRecord> {
  await ensureMigrated();
  const db = getDb();
  const id = randomUUID();
  const status = input.status ?? "todo";
  const completedAt = status === "complete" ? utcNowStamp() : null;
  // Lane position via inline COALESCE so concurrent creates can't read the
  // same MAX (mirrors createActionItem's task insert).
  await db.execute({
    sql: `INSERT INTO team_tasks
            (id, admin_id, client_id, title, description, status, priority,
             due_date, source, lineup, checklist, sort_pos, completed_at,
             created_by, created_by_name)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                  COALESCE((SELECT MAX(sort_pos) FROM team_tasks
                            WHERE admin_id = ? AND status = ?), 0) + ${LANE_SPACING},
                  ?, ?, ?)`,
    args: [
      id,
      input.adminId,
      input.clientId ?? null,
      input.title.trim().slice(0, MAX_TITLE_LEN),
      (input.description ?? "").slice(0, MAX_DESC_LEN),
      status,
      input.priority ?? "normal",
      input.dueDate && ISO_DATE_RE.test(input.dueDate) ? input.dueDate : null,
      input.source ?? "manual",
      input.lineup ? 1 : 0,
      JSON.stringify(sanitizeChecklist(input.checklist ?? [])),
      input.adminId,
      status,
      completedAt,
      input.createdBy ?? null,
      input.createdByName ?? null,
    ],
  });
  const created = await getTask(id);
  if (!created) throw new Error("Task insert did not persist");
  return created;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  clientId?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  lineup?: boolean;
  checklist?: TaskChecklistItem[];
}

/**
 * Partial field update. Status transitions set/clear completed_at and (via the
 * route layer) trigger the action-item sync — see
 * lib/teamActionItems.syncActionItemForTask, which the ROUTE calls after this
 * returns, so this module stays import-free of the action-item module.
 * A status change also re-lanes sort_pos to the bottom of the new lane.
 */
export async function updateTask(
  id: string,
  changes: UpdateTaskInput
): Promise<TeamTaskRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const existing = await getTask(id);
  if (!existing) return null;

  const fields: string[] = [];
  const args: InValue[] = [];
  const set = (col: string, val: InValue) => {
    fields.push(`${col} = ?`);
    args.push(val);
  };

  if (changes.title !== undefined) {
    const t = changes.title.trim().slice(0, MAX_TITLE_LEN);
    if (t) set("title", t);
  }
  if (changes.description !== undefined)
    set("description", changes.description.slice(0, MAX_DESC_LEN));
  if (changes.clientId !== undefined) set("client_id", changes.clientId);
  if (changes.priority !== undefined) set("priority", changes.priority);
  if (changes.dueDate !== undefined)
    set("due_date", changes.dueDate && ISO_DATE_RE.test(changes.dueDate) ? changes.dueDate : null);
  if (changes.lineup !== undefined) set("lineup", changes.lineup ? 1 : 0);
  if (changes.checklist !== undefined)
    set("checklist", JSON.stringify(sanitizeChecklist(changes.checklist)));

  if (changes.status !== undefined && changes.status !== existing.status) {
    set("status", changes.status);
    // Bottom of the new lane, computed in-statement (the row still has its old
    // status when the subquery evaluates, so it never counts itself).
    fields.push(
      `sort_pos = COALESCE((SELECT MAX(sort_pos) FROM team_tasks
                            WHERE admin_id = ? AND status = ?), 0) + ${LANE_SPACING}`
    );
    args.push(existing.adminId, changes.status);
    if (changes.status === "complete") {
      set("completed_at", utcNowStamp());
    } else if (existing.status === "complete") {
      set("completed_at", null);
    }
  }

  if (fields.length === 0) return existing;
  fields.push("updated_at = datetime('now')");
  args.push(id);
  await db.execute({
    sql: `UPDATE team_tasks SET ${fields.join(", ")} WHERE id = ?`,
    args,
  });
  return getTask(id);
}

/**
 * Drag-and-drop move: place the task in `status`, ordered directly after
 * `afterTaskId` (null = top of the lane). The midpoint is computed here, from
 * the CURRENT lane contents, so concurrent drags converge instead of trusting
 * client-supplied float positions. Rebalances the lane when the gap collapses.
 */
export async function moveTask(
  id: string,
  move: { status: TaskStatus; afterTaskId: string | null }
): Promise<TeamTaskRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const task = await getTask(id);
  if (!task) return null;

  // Current lane, excluding the moving task itself.
  const laneResult = await db.execute({
    sql: `SELECT id, sort_pos FROM team_tasks
          WHERE admin_id = ? AND status = ? AND id != ?
          ORDER BY sort_pos, created_at`,
    args: [task.adminId, move.status, id],
  });
  const lane = laneResult.rows.map((r) => ({
    id: String(r.id),
    pos: Number(r.sort_pos ?? 0),
  }));

  let insertIndex = 0;
  if (move.afterTaskId) {
    const idx = lane.findIndex((t) => t.id === move.afterTaskId);
    // Unknown anchor (concurrent delete/move) → drop to end of lane.
    insertIndex = idx >= 0 ? idx + 1 : lane.length;
  }

  const prev = insertIndex > 0 ? lane[insertIndex - 1].pos : null;
  const next = insertIndex < lane.length ? lane[insertIndex].pos : null;
  let newPos: number;
  if (prev == null && next == null) newPos = LANE_SPACING;
  else if (prev == null) newPos = (next as number) - LANE_SPACING;
  else if (next == null) newPos = prev + LANE_SPACING;
  else newPos = (prev + next) / 2;

  const needsRebalance =
    prev != null && next != null && next - prev < MIN_GAP;

  const statements: { sql: string; args: InValue[] }[] = [];
  if (needsRebalance) {
    // Rewrite the whole lane (with the moving task spliced in) to spaced ints.
    const ordered = [...lane];
    ordered.splice(insertIndex, 0, { id, pos: 0 });
    ordered.forEach((t, i) => {
      statements.push({
        sql: "UPDATE team_tasks SET sort_pos = ? WHERE id = ?",
        args: [(i + 1) * LANE_SPACING, t.id],
      });
    });
  }

  const fields = ["sort_pos = ?", "updated_at = datetime('now')"];
  const args: InValue[] = [needsRebalance ? 0 : newPos];
  if (move.status !== task.status) {
    fields.push("status = ?");
    args.push(move.status);
    if (move.status === "complete") {
      fields.push("completed_at = ?");
      args.push(utcNowStamp());
    } else if (task.status === "complete") {
      fields.push("completed_at = NULL");
    }
  }
  args.push(id);
  // On rebalance the moving task's pos was already written above — this final
  // UPDATE would clobber it with 0, so only include sort_pos when not rebalancing.
  const finalFields = needsRebalance ? fields.slice(1) : fields;
  const finalArgs = needsRebalance ? args.slice(1) : args;
  if (finalFields.length > 0 && finalArgs.length > 0) {
    statements.push({
      sql: `UPDATE team_tasks SET ${finalFields.join(", ")} WHERE id = ?`,
      args: finalArgs,
    });
  }

  await db.batch(statements, "write");
  return getTask(id);
}

/**
 * Full ownership transfer to another admin's hub. The task drops to the
 * bottom of the target hub's lane (same status), and any linked action item
 * moves with it in the SAME atomic batch — raw SQL on the item side by
 * design (mirrors the solve⇄complete sync; this module stays import-free of
 * lib/teamActionItems). The subquery reads the row's OLD admin_id, so the
 * moving task never counts itself in the target lane.
 */
export async function reassignTask(
  id: string,
  toAdminId: string
): Promise<TeamTaskRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const task = await getTask(id);
  if (!task) return null;
  if (task.adminId === toAdminId) return task;
  await db.batch(
    [
      {
        sql: `UPDATE team_tasks
              SET admin_id = ?,
                  sort_pos = COALESCE((SELECT MAX(sort_pos) FROM team_tasks
                                       WHERE admin_id = ? AND status = ?), 0) + ${LANE_SPACING},
                  updated_at = datetime('now')
              WHERE id = ?`,
        args: [toAdminId, toAdminId, task.status, id],
      },
      {
        sql: `UPDATE team_action_items SET admin_id = ?, updated_at = datetime('now')
              WHERE task_id = ?`,
        args: [toAdminId, id],
      },
    ],
    "write"
  );
  return getTask(id);
}

export async function deleteTask(id: string): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const existing = await getTask(id);
  if (!existing) return false;
  await db.batch(
    [
      // Detach any linked action item so it doesn't keep a dead task pointer
      // (the LEFT JOIN read is null-safe, but solve-via-task would dead-end).
      { sql: "UPDATE team_action_items SET task_id = NULL WHERE task_id = ?", args: [id] },
      { sql: "DELETE FROM team_task_comments WHERE task_id = ?", args: [id] },
      { sql: "DELETE FROM team_tasks WHERE id = ?", args: [id] },
    ],
    "write"
  );
  return true;
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

function rowToComment(row: Row): TeamTaskComment {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    adminId: row.admin_id != null ? String(row.admin_id) : null,
    authorName: String(row.author_name ?? ""),
    body: String(row.body ?? ""),
    kind: String(row.kind) === "activity" ? "activity" : "comment",
    createdAt: String(row.created_at || ""),
  };
}

export async function listComments(taskId: string): Promise<TeamTaskComment[]> {
  await ensureMigrated();
  const db = getDb();
  try {
    const result = await db.execute({
      sql: "SELECT * FROM team_task_comments WHERE task_id = ? ORDER BY created_at",
      args: [taskId],
    });
    return result.rows.map(rowToComment);
  } catch (err) {
    if (isNoSuchTable(err)) return [];
    throw err;
  }
}

export async function addComment(input: {
  taskId: string;
  adminId: string | null;
  authorName: string;
  body: string;
  kind?: "comment" | "activity";
}): Promise<TeamTaskComment> {
  await ensureMigrated();
  const db = getDb();
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO team_task_comments (id, task_id, admin_id, author_name, body, kind)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.taskId,
      input.adminId,
      input.authorName.trim().slice(0, 100),
      input.body.trim().slice(0, MAX_COMMENT_LEN),
      input.kind === "activity" ? "activity" : "comment",
    ],
  });
  const result = await db.execute({
    sql: "SELECT * FROM team_task_comments WHERE id = ?",
    args: [id],
  });
  return rowToComment(result.rows[0]);
}

/**
 * Fire-and-forget accountability trail: status moves / cross-surface events
 * become 'activity' rows in the task's comment timeline. Never throws — a
 * failed trail write must not fail the mutation it annotates.
 */
export async function recordTaskActivity(
  taskId: string,
  actor: { id: string | null; name: string },
  body: string
): Promise<void> {
  try {
    await addComment({
      taskId,
      adminId: actor.id,
      authorName: actor.name,
      body,
      kind: "activity",
    });
  } catch (err) {
    console.error("[teamTasks] activity record failed:", err);
  }
}
