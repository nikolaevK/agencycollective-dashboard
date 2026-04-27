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
 * Get show rate stats for a closer. Source is `event_attendance` (every
 * event the closer marked, with or without a linked deal) — that's the
 * closer's mental model of "how often does my prospect show up". Optional
 * window filters by `event_attendance.updated_at` so callers can match a
 * dashboard time-frame.
 */
export async function getCloserShowRate(
  closerId: string,
  opts: { since?: string; until?: string } = {}
): Promise<{
  showCount: number;
  noShowCount: number;
  showRate: number;
}> {
  await ensureMigrated();
  const db = getDb();
  const conditions: string[] = ["closer_id = ?"];
  const values: string[] = [closerId];
  if (opts.since) {
    conditions.push("substr(updated_at,1,10) >= ?");
    values.push(opts.since);
  }
  if (opts.until) {
    conditions.push("substr(updated_at,1,10) <= ?");
    values.push(opts.until);
  }
  const result = await db.execute({
    sql: `SELECT
            SUM(CASE WHEN show_status = 'showed' THEN 1 ELSE 0 END) AS show_count,
            SUM(CASE WHEN show_status = 'no_show' THEN 1 ELSE 0 END) AS no_show_count
          FROM event_attendance WHERE ${conditions.join(" AND ")}`,
    args: values,
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

export interface FollowUpAttendee {
  email: string;
  displayName: string | null;
  responseStatus: string | null;
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
  eventDescription: string | null;
  eventEnd: string | null;
  eventStatus: string | null;
  allDay: boolean;
  calendarName: string | null;
  meetLink: string | null;
  eventLocation: string | null;
  attendees: FollowUpAttendee[];
}

/**
 * Attendance follow-ups (no_show OR showed) that belong to this closer. Used
 * on the closer dashboard — each closer only sees events they themselves
 * marked. The `NoShowFollowUp` type is reused for both statuses since the
 * card layout is identical.
 */
export async function getAttendanceFollowUpsForCloser(
  closerId: string,
  status: AttendanceStatus,
  // 200 covers ~2 years for an active closer; the dashboard paginates
  // client-side, so this is the working set, not a page size.
  limit: number = 200
): Promise<NoShowFollowUp[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: `WITH latest_appt AS (
            SELECT id, google_event_id, setter_id, client_name, client_email,
                   scheduled_at, notes, pre_call_status, post_call_status, updated_at,
                   ROW_NUMBER() OVER (PARTITION BY google_event_id ORDER BY updated_at DESC) AS rn
              FROM appointments
          ),
          latest_deal AS (
            SELECT id, google_event_id, client_name, client_email, closing_date,
                   ROW_NUMBER() OVER (PARTITION BY google_event_id ORDER BY updated_at DESC) AS rn
              FROM deals
             WHERE google_event_id IS NOT NULL
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
       LEFT JOIN latest_deal d ON d.google_event_id = ea.google_event_id AND d.rn = 1
           WHERE ea.show_status = ? AND ea.closer_id = ?
        ORDER BY ea.updated_at DESC
           LIMIT ?`,
    args: [status, closerId, limit],
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
    eventDescription: null,
    eventEnd: null,
    eventStatus: null,
    allDay: false,
    calendarName: null,
    meetLink: null,
    eventLocation: null,
    attendees: [],
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
          ),
          latest_deal AS (
            SELECT id, google_event_id, client_name, client_email, closing_date,
                   ROW_NUMBER() OVER (PARTITION BY google_event_id ORDER BY updated_at DESC) AS rn
              FROM deals
             WHERE google_event_id IS NOT NULL
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
       LEFT JOIN latest_deal d ON d.google_event_id = la.google_event_id AND d.rn = 1
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
    eventDescription: null,
    eventEnd: null,
    eventStatus: null,
    allDay: false,
    calendarName: null,
    meetLink: null,
    eventLocation: null,
    attendees: [],
  }));
}

/**
 * Enrich attendance-follow-up rows (no_show OR showed) with Google Calendar
 * event data — title, attendees, meet link, location, scheduled time.
 * Essential when a row has no appointment and no linked deal; the Google
 * event is then the only source of "who is this".
 *
 * Window: oldest markedAt minus a 30-day buffer (events end BEFORE they're
 * marked; without buffer Google's events.list excludes them and rows render
 * bare), capped at 2 years back, rounded to UTC day boundaries so concurrent
 * dashboard loads share the same `getCalendarEvents` cache key.
 *
 * Joins by google_event_id; rows whose Google event isn't in range stay
 * un-enriched. Input order is preserved so callers can split a combined
 * input (e.g. no-shows + showed) by index.
 */
export async function enrichNoShowsFromCalendar(
  noShows: NoShowFollowUp[]
): Promise<NoShowFollowUp[]> {
  if (noShows.length === 0) return noShows;

  // Lazy import to avoid pulling googleapis into modules that don't need it.
  const { getCalendarEvents } = await import("./google/calendar");

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const twoYearsAgoMs = now - 2 * 365 * dayMs;
  const oldestMarkedMs = Math.min(
    ...noShows.map((n) => {
      const t = Date.parse(n.markedAt);
      return Number.isNaN(t) ? now : t;
    })
  );
  // Events end BEFORE they're marked no-show (often hours, sometimes days
  // later). Google's events.list timeMin is exclusive on event end time, so
  // anchoring timeMin at oldestMarked silently drops the event from the
  // fetch and the card renders with no client name/time/email — looks empty.
  // Subtract a 30-day buffer to cover late marks; cap at 2 years.
  const candidateMinMs = Math.max(oldestMarkedMs - 30 * dayMs, twoYearsAgoMs);
  // Round to UTC day boundaries so concurrent dashboard loads share one
  // cache key — without this, ms-precision timeMin/timeMax made the 2-min
  // Google cache useless across requests.
  const timeMin = new Date(Math.floor(candidateMinMs / dayMs) * dayMs).toISOString();
  const timeMax = new Date((Math.floor(now / dayMs) + 1) * dayMs).toISOString();

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
      // getCalendarEvents already strips description HTML at the source.
      eventDescription: evt.description,
      eventEnd: evt.end || null,
      eventStatus: evt.status ?? null,
      allDay: evt.allDay,
      calendarName: evt.calendarName ?? null,
      meetLink: evt.meetLink,
      eventLocation: evt.location,
      attendees: evt.attendees.map((a) => ({
        email: a.email,
        displayName: a.displayName,
        responseStatus: a.responseStatus,
      })),
    };
  });
}

/**
 * Get team-wide show rate stats with per-closer breakdown. Same source +
 * window semantics as getCloserShowRate (event_attendance, filtered by
 * updated_at), so admin and closer surfaces report the same numbers.
 */
export async function getTeamShowRate(
  opts: { since?: string; until?: string } = {}
): Promise<{
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

  const conditions: string[] = [];
  const values: string[] = [];
  if (opts.since) {
    conditions.push("substr(updated_at,1,10) >= ?");
    values.push(opts.since);
  }
  if (opts.until) {
    conditions.push("substr(updated_at,1,10) <= ?");
    values.push(opts.until);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const totals = await db.execute({
    sql: `SELECT
            SUM(CASE WHEN show_status = 'showed' THEN 1 ELSE 0 END) AS show_count,
            SUM(CASE WHEN show_status = 'no_show' THEN 1 ELSE 0 END) AS no_show_count
          FROM event_attendance ${where}`,
    args: values,
  });
  const t = totals.rows[0];
  const teamShow = Number(t?.show_count ?? 0);
  const teamNoShow = Number(t?.no_show_count ?? 0);
  const teamTotal = teamShow + teamNoShow;

  const breakdowns = await db.execute({
    sql: `SELECT
            closer_id,
            SUM(CASE WHEN show_status = 'showed' THEN 1 ELSE 0 END) AS show_count,
            SUM(CASE WHEN show_status = 'no_show' THEN 1 ELSE 0 END) AS no_show_count
          FROM event_attendance ${where}
          GROUP BY closer_id`,
    args: values,
  });

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
