import { getDb, ensureMigrated } from "./db";

export type AttendanceStatus = "showed" | "no_show";

export interface EventAttendance {
  googleEventId: string;
  closerId: string;
  showStatus: AttendanceStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Upsert show/no-show for a calendar event.
 */
export async function setEventAttendance(
  googleEventId: string,
  closerId: string,
  showStatus: AttendanceStatus
): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO event_attendance (google_event_id, closer_id, show_status)
          VALUES (?, ?, ?)
          ON CONFLICT(google_event_id, closer_id)
          DO UPDATE SET show_status = ?, updated_at = datetime('now')`,
    args: [googleEventId, closerId, showStatus, showStatus],
  });
}

/**
 * Delete show/no-show for a calendar event (undo).
 */
export async function deleteEventAttendance(
  googleEventId: string,
  closerId: string
): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: "DELETE FROM event_attendance WHERE google_event_id = ? AND closer_id = ?",
    args: [googleEventId, closerId],
  });
}

/**
 * Get attendance records for a closer.
 */
export async function getAttendanceByCloser(
  closerId: string
): Promise<Map<string, AttendanceStatus>> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT google_event_id, show_status FROM event_attendance WHERE closer_id = ?",
    args: [closerId],
  });
  const map = new Map<string, AttendanceStatus>();
  for (const row of result.rows) {
    map.set(String(row.google_event_id), String(row.show_status) as AttendanceStatus);
  }
  return map;
}

/**
 * Get all attendance records (for admin views).
 */
export async function getAllAttendance(): Promise<EventAttendance[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute(
    "SELECT google_event_id, closer_id, show_status, created_at, updated_at FROM event_attendance ORDER BY updated_at DESC"
  );
  return result.rows.map((row) => ({
    googleEventId: String(row.google_event_id),
    closerId: String(row.closer_id),
    showStatus: String(row.show_status) as AttendanceStatus,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

/**
 * Get show rate stats for a closer.
 */
export async function getCloserShowRate(closerId: string): Promise<{
  showCount: number;
  noShowCount: number;
  showRate: number;
}> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT
            SUM(CASE WHEN show_status = 'showed' THEN 1 ELSE 0 END) AS show_count,
            SUM(CASE WHEN show_status = 'no_show' THEN 1 ELSE 0 END) AS no_show_count
          FROM event_attendance WHERE closer_id = ?`,
    args: [closerId],
  });
  const row = result.rows[0];
  const showCount = Number(row?.show_count ?? 0);
  const noShowCount = Number(row?.no_show_count ?? 0);
  const total = showCount + noShowCount;
  return {
    showCount,
    noShowCount,
    showRate: total > 0 ? Math.round((showCount / total) * 1000) / 10 : 0,
  };
}

/**
 * Get team-wide show rate stats with per-closer breakdown.
 */
export async function getTeamShowRate(): Promise<{
  showCount: number;
  noShowCount: number;
  showRate: number;
  closerBreakdowns: Array<{
    closerId: string;
    showCount: number;
    noShowCount: number;
    showRate: number;
  }>;
}> {
  await ensureMigrated();
  const db = getDb();

  const totals = await db.execute(
    `SELECT
       SUM(CASE WHEN show_status = 'showed' THEN 1 ELSE 0 END) AS show_count,
       SUM(CASE WHEN show_status = 'no_show' THEN 1 ELSE 0 END) AS no_show_count
     FROM event_attendance`
  );
  const t = totals.rows[0];
  const teamShow = Number(t?.show_count ?? 0);
  const teamNoShow = Number(t?.no_show_count ?? 0);
  const teamTotal = teamShow + teamNoShow;

  const breakdowns = await db.execute(
    `SELECT
       closer_id,
       SUM(CASE WHEN show_status = 'showed' THEN 1 ELSE 0 END) AS show_count,
       SUM(CASE WHEN show_status = 'no_show' THEN 1 ELSE 0 END) AS no_show_count
     FROM event_attendance
     GROUP BY closer_id`
  );

  return {
    showCount: teamShow,
    noShowCount: teamNoShow,
    showRate: teamTotal > 0 ? Math.round((teamShow / teamTotal) * 1000) / 10 : 0,
    closerBreakdowns: breakdowns.rows.map((row) => {
      const sc = Number(row.show_count ?? 0);
      const nsc = Number(row.no_show_count ?? 0);
      const tot = sc + nsc;
      return {
        closerId: String(row.closer_id),
        showCount: sc,
        noShowCount: nsc,
        showRate: tot > 0 ? Math.round((sc / tot) * 1000) / 10 : 0,
      };
    }),
  };
}
