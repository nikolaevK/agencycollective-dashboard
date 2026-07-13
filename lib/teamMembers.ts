import { randomUUID } from "crypto";
import { getDb, ensureMigrated } from "./db";
import type { Row } from "@libsql/client";

// ---------------------------------------------------------------------------
// Team roster — manual satellite table over admins (team_members, see
// lib/db.ts). One row per rostered admin; `attribution` drives how the
// member's clients / MRR-managed derive from the Client Directory
// (lib/teamHub.ts):
//   book        → the entire active book rolls up (COO)
//   lead        → clients where client_team role = 'lead'
//   media_buyer → clients where client_team role = 'media_buyer'
//   csm         → clients where client_team role = 'csm'
// Goals are per-month history ('yyyy-mm', business TZ) with carry-forward:
// a month without a row inherits the latest earlier goal until changed.
// ---------------------------------------------------------------------------

export const TEAM_ATTRIBUTIONS = ["book", "lead", "media_buyer", "csm"] as const;
export type TeamAttribution = (typeof TEAM_ATTRIBUTIONS)[number];

export const TEAM_ATTRIBUTION_OPTIONS: { value: TeamAttribution; label: string }[] = [
  { value: "book", label: "Entire book (COO)" },
  { value: "lead", label: "Head of Ads (lead)" },
  { value: "media_buyer", label: "Media Buyer" },
  { value: "csm", label: "Client Success Manager" },
];

export function parseAttribution(value: unknown): TeamAttribution | null {
  const s = String(value ?? "").trim();
  return (TEAM_ATTRIBUTIONS as readonly string[]).includes(s)
    ? (s as TeamAttribution)
    : null;
}

export interface TeamMemberRecord {
  id: string;
  adminId: string;
  position: string;
  attribution: TeamAttribution;
  sortOrder: number;
  /** CSM auto-split weight (0–100); null = equal share with the other CSMs. */
  splitSharePercent: number | null;
  createdAt: string;
  updatedAt: string;
  // Joined from admins on read (identity lives there, never duplicated here):
  name: string;
  email: string | null;
  avatarPath: string | null;
  adminRole: string;
}

function isNoSuchTable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /no such table/i.test(msg);
}

function rowToTeamMember(row: Row): TeamMemberRecord | null {
  // LEFT JOIN admins — a null username means the admin was deleted; drop it.
  if (row.username == null) return null;
  const attribution = parseAttribution(row.attribution) ?? "lead";
  return {
    id: String(row.id),
    adminId: String(row.admin_id),
    position: row.position != null ? String(row.position) : "",
    attribution,
    sortOrder: Number(row.sort_order ?? 0),
    splitSharePercent:
      row.split_share_percent != null ? Number(row.split_share_percent) : null,
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
    name:
      row.display_name != null && String(row.display_name).trim()
        ? String(row.display_name)
        : String(row.username),
    email: row.email != null ? String(row.email) : null,
    avatarPath: row.avatar_path != null ? String(row.avatar_path) : null,
    adminRole: row.admin_role != null ? String(row.admin_role) : "admin",
  };
}

const MEMBER_SELECT = `
  SELECT tm.*, a.username, a.display_name, a.email, a.avatar_path, a.role AS admin_role
  FROM team_members tm
  LEFT JOIN admins a ON a.id = tm.admin_id
`;

export async function listTeamMembers(): Promise<TeamMemberRecord[]> {
  await ensureMigrated();
  const db = getDb();
  try {
    const result = await db.execute(
      `${MEMBER_SELECT} ORDER BY tm.sort_order, a.display_name, a.username`
    );
    return result.rows
      .map(rowToTeamMember)
      .filter((m): m is TeamMemberRecord => m !== null);
  } catch (err) {
    if (isNoSuchTable(err)) return [];
    throw err;
  }
}

export async function getTeamMember(adminId: string): Promise<TeamMemberRecord | null> {
  await ensureMigrated();
  const db = getDb();
  try {
    const result = await db.execute({
      sql: `${MEMBER_SELECT} WHERE tm.admin_id = ?`,
      args: [adminId],
    });
    return result.rows[0] ? rowToTeamMember(result.rows[0]) : null;
  } catch (err) {
    if (isNoSuchTable(err)) return null;
    throw err;
  }
}

export class DuplicateTeamMemberError extends Error {
  constructor() {
    super("This admin is already on the team roster");
    this.name = "DuplicateTeamMemberError";
  }
}

export interface TeamMemberInput {
  position?: string;
  attribution?: TeamAttribution;
  sortOrder?: number;
  /** null clears the weight (back to equal share). */
  splitSharePercent?: number | null;
}

function clampSharePercent(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export async function createTeamMember(
  adminId: string,
  input: TeamMemberInput
): Promise<TeamMemberRecord> {
  await ensureMigrated();
  const db = getDb();
  try {
    await db.execute({
      sql: `INSERT INTO team_members (id, admin_id, position, attribution, sort_order, split_share_percent)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        randomUUID(),
        adminId,
        (input.position ?? "").trim().slice(0, 100),
        input.attribution ?? "lead",
        Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : 0,
        clampSharePercent(input.splitSharePercent ?? null),
      ],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/UNIQUE constraint failed/i.test(msg)) throw new DuplicateTeamMemberError();
    throw err;
  }
  const created = await getTeamMember(adminId);
  if (!created) throw new Error("Team member insert did not persist");
  return created;
}

export async function updateTeamMember(
  adminId: string,
  changes: TeamMemberInput
): Promise<TeamMemberRecord | null> {
  await ensureMigrated();
  const db = getDb();

  const fields: string[] = [];
  const args: (string | number | null)[] = [];
  if (changes.position !== undefined) {
    fields.push("position = ?");
    args.push(changes.position.trim().slice(0, 100));
  }
  if (changes.attribution !== undefined) {
    fields.push("attribution = ?");
    args.push(changes.attribution);
  }
  if (changes.sortOrder !== undefined && Number.isFinite(changes.sortOrder)) {
    fields.push("sort_order = ?");
    args.push(Number(changes.sortOrder));
  }
  if (changes.splitSharePercent !== undefined) {
    fields.push("split_share_percent = ?");
    args.push(clampSharePercent(changes.splitSharePercent));
  }
  if (fields.length > 0) {
    fields.push("updated_at = datetime('now')");
    args.push(adminId);
    await db.execute({
      sql: `UPDATE team_members SET ${fields.join(", ")} WHERE admin_id = ?`,
      args,
    });
  }
  return getTeamMember(adminId);
}

/**
 * Remove a member from the roster AND their team workspace data (goals,
 * tasks + comments, action items). Destructive — the confirm lives in the UI.
 * Client assignments (client_team) are NOT touched: attribution of clients is
 * directory data, not Team-page data.
 */
export async function removeTeamMember(adminId: string): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.batch(
    [
      {
        sql: `DELETE FROM team_task_comments
              WHERE task_id IN (SELECT id FROM team_tasks WHERE admin_id = ?)`,
        args: [adminId],
      },
      { sql: "DELETE FROM team_tasks WHERE admin_id = ?", args: [adminId] },
      { sql: "DELETE FROM team_action_items WHERE admin_id = ?", args: [adminId] },
      { sql: "DELETE FROM team_member_goals WHERE admin_id = ?", args: [adminId] },
      { sql: "DELETE FROM team_members WHERE admin_id = ?", args: [adminId] },
    ],
    "write"
  );
}

// ---------------------------------------------------------------------------
// Goals — per-month history with carry-forward
// ---------------------------------------------------------------------------

const MONTH_RE = /^\d{4}-\d{2}$/;

export function isValidGoalMonth(month: string): boolean {
  return MONTH_RE.test(month);
}

/**
 * The goal in effect for `month`: the row for that month, else the latest
 * earlier month's row (carry-forward), else 0. Future months never leak back.
 */
export async function getGoalCents(adminId: string, month: string): Promise<number> {
  await ensureMigrated();
  const db = getDb();
  try {
    const result = await db.execute({
      sql: `SELECT goal_cents FROM team_member_goals
            WHERE admin_id = ? AND month <= ?
            ORDER BY month DESC LIMIT 1`,
      args: [adminId, month],
    });
    return result.rows[0] ? Number(result.rows[0].goal_cents ?? 0) : 0;
  } catch (err) {
    if (isNoSuchTable(err)) return 0;
    throw err;
  }
}

/** Effective goals for all admins at once (one query) — Team home rollups. */
export async function getGoalsCentsByAdmin(month: string): Promise<Map<string, number>> {
  await ensureMigrated();
  const db = getDb();
  const map = new Map<string, number>();
  try {
    // Latest row per admin with month <= requested (carry-forward semantics).
    const result = await db.execute({
      sql: `SELECT g.admin_id, g.goal_cents
            FROM team_member_goals g
            JOIN (
              SELECT admin_id, MAX(month) AS month
              FROM team_member_goals WHERE month <= ?
              GROUP BY admin_id
            ) latest ON latest.admin_id = g.admin_id AND latest.month = g.month`,
      args: [month],
    });
    for (const row of result.rows) {
      map.set(String(row.admin_id), Number(row.goal_cents ?? 0));
    }
  } catch (err) {
    if (!isNoSuchTable(err)) throw err;
  }
  return map;
}

/** Explicit goal rows for one member, newest first (goal history UI). */
export async function listGoalHistory(
  adminId: string
): Promise<Array<{ month: string; goalCents: number }>> {
  await ensureMigrated();
  const db = getDb();
  try {
    const result = await db.execute({
      sql: `SELECT month, goal_cents FROM team_member_goals
            WHERE admin_id = ? ORDER BY month DESC LIMIT 24`,
      args: [adminId],
    });
    return result.rows.map((row) => ({
      month: String(row.month),
      goalCents: Number(row.goal_cents ?? 0),
    }));
  } catch (err) {
    if (isNoSuchTable(err)) return [];
    throw err;
  }
}

export async function setGoalCents(
  adminId: string,
  month: string,
  goalCents: number
): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO team_member_goals (admin_id, month, goal_cents)
          VALUES (?, ?, ?)
          ON CONFLICT(admin_id, month)
          DO UPDATE SET goal_cents = excluded.goal_cents, updated_at = datetime('now')`,
    args: [adminId, month, Math.max(0, Math.round(goalCents))],
  });
}

// ---------------------------------------------------------------------------
// Unrostered assignees — admins holding client_team assignments without a
// roster row. Surfaced on Team home so nothing is silently invisible.
// ---------------------------------------------------------------------------

export interface UnrosteredAssignee {
  adminId: string;
  name: string;
  avatarPath: string | null;
  roles: string[]; // distinct client_team roles they hold
  clientCount: number;
}

export async function listUnrosteredAssignees(): Promise<UnrosteredAssignee[]> {
  await ensureMigrated();
  const db = getDb();
  try {
    // Only ACTIVE clients count — an admin whose assignments are all on
    // inactive/archived clients isn't managing anyone the Team page shows.
    const result = await db.execute(
      `SELECT ct.admin_id, a.username, a.display_name, a.avatar_path,
              GROUP_CONCAT(DISTINCT ct.role) AS roles,
              COUNT(DISTINCT ct.user_id) AS client_count
       FROM client_team ct
       JOIN admins a ON a.id = ct.admin_id
       JOIN users u ON u.id = ct.user_id AND u.status = 'active'
       WHERE ct.admin_id NOT IN (SELECT admin_id FROM team_members)
       GROUP BY ct.admin_id
       ORDER BY client_count DESC`
    );
    return result.rows.map((row) => ({
      adminId: String(row.admin_id),
      name:
        row.display_name != null && String(row.display_name).trim()
          ? String(row.display_name)
          : String(row.username),
      avatarPath: row.avatar_path != null ? String(row.avatar_path) : null,
      roles: String(row.roles ?? "")
        .split(",")
        .filter(Boolean),
      clientCount: Number(row.client_count ?? 0),
    }));
  } catch (err) {
    if (isNoSuchTable(err)) return [];
    throw err;
  }
}
