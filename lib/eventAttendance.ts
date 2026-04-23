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
 * Team-wide map of event → latest show_status for any closer. Used by
 * calendar surfaces so setters and closers see every mark, not only their
 * own. Admin already has a similar endpoint; this is the shared read path.
 */
export async function getLatestAttendanceByEvent(): Promise<Record<string, AttendanceStatus>> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute(
    `SELECT google_event_id, show_status, updated_at
       FROM event_attendance
       ORDER BY updated_at DESC`
  );
  const out: Record<string, AttendanceStatus> = {};
  for (const row of result.rows) {
    const id = String(row.google_event_id);
    // Newest row for each event wins; skip subsequent rows.
    if (id in out) continue;
    out[id] = String(row.show_status) as AttendanceStatus;
  }
  return out;
}

export interface NoShowFollowUp {
  googleEventId: string;
  markedAt: string;
  markedByCloserName: string | null;
  clientName: string | null;
  clientEmail: string | null;
  scheduledAt: string | null;
  setterName: string | null;
  setterNotes: string | null;
  dealId: string | null;
  /**
   * Appointment metadata so the UI can show status pills and let setters
   * edit state inline. All three are null when the event has no appointment
   * yet (closer linked a deal without a setter prep pass). The editor can
   * create the appointment on first save.
   */
  appointmentId: string | null;
  preCallStatus: string | null;
  postCallStatus: string | null;
  /**
   * Enrichment pulled from the Google Calendar event itself. Critical when a
   * no-show has no appointment and no linked deal — without these, the setter
   * has zero information on whom to call. Populated by enrichNoShowsFromCalendar.
   */
  eventTitle: string | null;
  calendarName: string | null;
  meetLink: string | null;
  eventLocation: string | null;
  attendeeEmails: string[];
}

/**
 * No-shows that belong to this closer. Used on the closer dashboard —
 * each closer only sees events they marked no_show themselves.
 */
export async function getNoShowFollowUpsForCloser(
  closerId: string,
  limit: number = 20
): Promise<NoShowFollowUp[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: `WITH latest_appt AS (
            SELECT id, google_event_id, setter_id, client_name, client_email,
                   scheduled_at, notes, pre_call_status, post_call_status, updated_at,
                   ROW_NUMBER() OVER (PARTITION BY google_event_id ORDER BY updated_at DESC) AS rn
              FROM appointments
          )
          SELECT
             ea.google_event_id,
             ea.updated_at AS marked_at,
             mc.display_name AS marked_by_closer_name,
             ap.id AS appointment_id,
             ap.client_name AS appt_client_name,
             ap.client_email AS appt_client_email,
             ap.scheduled_at AS appt_scheduled_at,
             ap.notes AS setter_notes,
             ap.pre_call_status AS pre_call_status,
             ap.post_call_status AS post_call_status,
             sc.display_name AS setter_name,
             d.id AS deal_id,
             d.client_name AS deal_client_name,
             d.client_email AS deal_client_email,
             d.closing_date AS deal_closing_date
            FROM event_attendance ea
       LEFT JOIN closers mc ON mc.id = ea.closer_id
       LEFT JOIN latest_appt ap ON ap.google_event_id = ea.google_event_id AND ap.rn = 1
       LEFT JOIN closers sc ON sc.id = ap.setter_id
       LEFT JOIN deals d ON d.google_event_id = ea.google_event_id
           WHERE ea.show_status = 'no_show' AND ea.closer_id = ?
        ORDER BY ea.updated_at DESC
           LIMIT ?`,
    args: [closerId, limit],
  });
  return result.rows.map((row) => ({
    googleEventId: String(row.google_event_id),
    markedAt: String(row.marked_at),
    markedByCloserName: row.marked_by_closer_name != null ? String(row.marked_by_closer_name) : null,
    clientName:
      row.appt_client_name != null
        ? String(row.appt_client_name)
        : row.deal_client_name != null
          ? String(row.deal_client_name)
          : null,
    clientEmail:
      row.appt_client_email != null
        ? String(row.appt_client_email)
        : row.deal_client_email != null
          ? String(row.deal_client_email)
          : null,
    scheduledAt:
      row.appt_scheduled_at != null
        ? String(row.appt_scheduled_at)
        : row.deal_closing_date != null
          ? String(row.deal_closing_date)
          : null,
    setterName: row.setter_name != null ? String(row.setter_name) : null,
    setterNotes: row.setter_notes != null ? String(row.setter_notes) : null,
    dealId: row.deal_id != null ? String(row.deal_id) : null,
    appointmentId: row.appointment_id != null ? String(row.appointment_id) : null,
    preCallStatus: row.pre_call_status != null ? String(row.pre_call_status) : null,
    postCallStatus: row.post_call_status != null ? String(row.post_call_status) : null,
    eventTitle: null,
    calendarName: null,
    meetLink: null,
    eventLocation: null,
    attendeeEmails: [],
  }));
}

/**
 * Team-wide no-shows used by the setter dashboard. One row per event —
 * the latest closer mark wins when multiple closers marked the same event,
 * and the latest setter's claim wins when multiple setters prepped it.
 */
export async function getNoShowFollowUpsTeamWide(
  // Hard cap. 500 covers any realistic working queue without blowing up the
  // payload on long-running accounts. If a setter needs older rows, bump
  // the cap or add server-side pagination when the need is real.
  limit: number = 500
): Promise<NoShowFollowUp[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: `WITH latest_attendance AS (
            SELECT google_event_id, closer_id, updated_at,
                   ROW_NUMBER() OVER (PARTITION BY google_event_id ORDER BY updated_at DESC) AS rn
              FROM event_attendance
             WHERE show_status = 'no_show'
          ),
          latest_appt AS (
            SELECT id, google_event_id, setter_id, client_name, client_email,
                   scheduled_at, notes, pre_call_status, post_call_status, updated_at,
                   ROW_NUMBER() OVER (PARTITION BY google_event_id ORDER BY updated_at DESC) AS rn
              FROM appointments
          )
          SELECT
             la.google_event_id,
             la.updated_at AS marked_at,
             mc.display_name AS marked_by_closer_name,
             ap.id AS appointment_id,
             ap.client_name AS appt_client_name,
             ap.client_email AS appt_client_email,
             ap.scheduled_at AS appt_scheduled_at,
             ap.notes AS setter_notes,
             ap.pre_call_status AS pre_call_status,
             ap.post_call_status AS post_call_status,
             sc.display_name AS setter_name,
             d.id AS deal_id,
             d.client_name AS deal_client_name,
             d.client_email AS deal_client_email,
             d.closing_date AS deal_closing_date
            FROM latest_attendance la
       LEFT JOIN closers mc ON mc.id = la.closer_id
       LEFT JOIN latest_appt ap ON ap.google_event_id = la.google_event_id AND ap.rn = 1
       LEFT JOIN closers sc ON sc.id = ap.setter_id
       LEFT JOIN deals d ON d.google_event_id = la.google_event_id
           WHERE la.rn = 1
        ORDER BY la.updated_at DESC
           LIMIT ?`,
    args: [limit],
  });
  return result.rows.map((row) => ({
    googleEventId: String(row.google_event_id),
    markedAt: String(row.marked_at),
    markedByCloserName: row.marked_by_closer_name != null ? String(row.marked_by_closer_name) : null,
    clientName:
      row.appt_client_name != null
        ? String(row.appt_client_name)
        : row.deal_client_name != null
          ? String(row.deal_client_name)
          : null,
    clientEmail:
      row.appt_client_email != null
        ? String(row.appt_client_email)
        : row.deal_client_email != null
          ? String(row.deal_client_email)
          : null,
    scheduledAt:
      row.appt_scheduled_at != null
        ? String(row.appt_scheduled_at)
        : row.deal_closing_date != null
          ? String(row.deal_closing_date)
          : null,
    setterName: row.setter_name != null ? String(row.setter_name) : null,
    setterNotes: row.setter_notes != null ? String(row.setter_notes) : null,
    dealId: row.deal_id != null ? String(row.deal_id) : null,
    appointmentId: row.appointment_id != null ? String(row.appointment_id) : null,
    preCallStatus: row.pre_call_status != null ? String(row.pre_call_status) : null,
    postCallStatus: row.post_call_status != null ? String(row.post_call_status) : null,
    eventTitle: null,
    calendarName: null,
    meetLink: null,
    eventLocation: null,
    attendeeEmails: [],
  }));
}

/**
 * Enrich no-show rows with Google Calendar event data (title, attendees,
 * meet link, location, scheduled time). Essential when a no-show has no
 * appointment and no linked deal — the Google event is the only source of
 * "who to follow up with".
 *
 * Fetches events starting from the oldest no-show's markedAt (bounded to 2
 * years back so the Google window isn't unbounded) through now. Joins by
 * google_event_id; rows whose Google event isn't in range stay un-enriched.
 */
export async function enrichNoShowsFromCalendar(
  noShows: NoShowFollowUp[]
): Promise<NoShowFollowUp[]> {
  if (noShows.length === 0) return noShows;

  // Lazy import to avoid pulling googleapis into modules that don't need it.
  const { getCalendarEvents } = await import("./google/calendar");

  const now = Date.now();
  const twoYearsAgoMs = now - 2 * 365 * 24 * 60 * 60 * 1000;
  const oldestMarkedMs = Math.min(
    ...noShows.map((n) => {
      const t = Date.parse(n.markedAt);
      return Number.isNaN(t) ? now : t;
    })
  );
  const timeMin = new Date(Math.max(oldestMarkedMs, twoYearsAgoMs)).toISOString();
  // Add a day of headroom on each end — markedAt can land after the event,
  // and future-scheduled events could exist for recent marks.
  const timeMax = new Date(now + 24 * 60 * 60 * 1000).toISOString();

  let events: Awaited<ReturnType<typeof getCalendarEvents>> = [];
  try {
    events = await getCalendarEvents(timeMin, timeMax);
  } catch (err) {
    console.error("[no-show-enrich] Failed to fetch Google events:", err);
    return noShows;
  }

  const byId = new Map(events.map((e) => [e.id, e]));
  return noShows.map((n) => {
    const evt = byId.get(n.googleEventId);
    if (!evt) return n;
    const firstAttendee = evt.attendees[0]?.email ?? null;
    return {
      ...n,
      clientName: n.clientName ?? evt.title,
      clientEmail: n.clientEmail ?? firstAttendee,
      scheduledAt: n.scheduledAt ?? evt.start,
      eventTitle: evt.title,
      calendarName: evt.calendarName ?? null,
      meetLink: evt.meetLink,
      eventLocation: evt.location,
      attendeeEmails: evt.attendees.map((a) => a.email),
    };
  });
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
