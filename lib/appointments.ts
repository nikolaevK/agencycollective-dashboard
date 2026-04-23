import crypto from "crypto";
import { getDb, ensureMigrated } from "./db";
import type { Row } from "@libsql/client";

export type PreCallStatus =
  | "not_called"
  | "auto_confirmed"
  | "auto_no_answer"
  | "triaged_confirmed"
  | "confirmed"
  | "no_answer"
  | "voicemail"
  | "rescheduled"
  | "cancelled";

export type PostCallStatus =
  | "not_called"
  | "followed_up"
  | "needs_followup"
  | "qualified"
  | "disqualified"
  | "no_answer";

// Ordered for the dropdown: initial state → automation outcomes → setter's
// manual-call outcomes → prospect-driven outcomes.
export const PRE_CALL_STATUSES: PreCallStatus[] = [
  "not_called",
  "auto_confirmed",
  "auto_no_answer",
  "triaged_confirmed",
  "confirmed",
  "no_answer",
  "voicemail",
  "rescheduled",
  "cancelled",
];

export const POST_CALL_STATUSES: PostCallStatus[] = [
  "not_called",
  "followed_up",
  "needs_followup",
  "qualified",
  "disqualified",
  "no_answer",
];

export interface AppointmentRecord {
  id: string;
  setterId: string;
  googleEventId: string;
  clientName: string | null;
  clientEmail: string | null;
  scheduledAt: string | null;
  preCallStatus: PreCallStatus;
  postCallStatus: PostCallStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToAppointment(row: Row): AppointmentRecord {
  return {
    id: String(row.id),
    setterId: String(row.setter_id),
    googleEventId: String(row.google_event_id),
    clientName: row.client_name != null ? String(row.client_name) : null,
    clientEmail: row.client_email != null ? String(row.client_email) : null,
    scheduledAt: row.scheduled_at != null ? String(row.scheduled_at) : null,
    preCallStatus: String(row.pre_call_status) as PreCallStatus,
    postCallStatus: String(row.post_call_status) as PostCallStatus,
    notes: row.notes != null ? String(row.notes) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listAppointmentsBySetter(
  setterId: string
): Promise<AppointmentRecord[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM appointments WHERE setter_id = ? ORDER BY scheduled_at DESC NULLS LAST, updated_at DESC",
    args: [setterId],
  });
  return result.rows.map(rowToAppointment);
}

export async function findAppointmentByEvent(
  setterId: string,
  googleEventId: string
): Promise<AppointmentRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM appointments WHERE setter_id = ? AND google_event_id = ?",
    args: [setterId, googleEventId],
  });
  return result.rows[0] ? rowToAppointment(result.rows[0]) : null;
}

export async function findAppointmentById(
  id: string
): Promise<AppointmentRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM appointments WHERE id = ?",
    args: [id],
  });
  return result.rows[0] ? rowToAppointment(result.rows[0]) : null;
}

/**
 * Find the most recently touched setter claim for a given Google event across
 * all setters. Used by deal auto-assignment (Phase 3) to attribute a deal to
 * whichever setter most recently worked the appointment.
 */
export async function findLatestAppointmentByEvent(
  googleEventId: string
): Promise<AppointmentRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM appointments WHERE google_event_id = ? ORDER BY updated_at DESC LIMIT 1",
    args: [googleEventId],
  });
  return result.rows[0] ? rowToAppointment(result.rows[0]) : null;
}

export interface UpsertAppointmentInput {
  setterId: string;
  googleEventId: string;
  clientName?: string | null;
  clientEmail?: string | null;
  scheduledAt?: string | null;
  preCallStatus?: PreCallStatus;
  postCallStatus?: PostCallStatus;
  notes?: string | null;
}

/**
 * Create or update a setter's appointment record for a Google event.
 * The (setter_id, google_event_id) pair is unique — calling upsert again
 * updates the existing row instead of creating a duplicate.
 */
export async function upsertAppointment(
  input: UpsertAppointmentInput
): Promise<AppointmentRecord> {
  await ensureMigrated();
  const db = getDb();

  const existing = await findAppointmentByEvent(input.setterId, input.googleEventId);

  if (existing) {
    const fields: string[] = [];
    const args: (string | null)[] = [];

    if (input.clientName !== undefined) {
      fields.push("client_name = ?");
      args.push(input.clientName);
    }
    if (input.clientEmail !== undefined) {
      fields.push("client_email = ?");
      args.push(input.clientEmail);
    }
    if (input.scheduledAt !== undefined) {
      fields.push("scheduled_at = ?");
      args.push(input.scheduledAt);
    }
    if (input.preCallStatus !== undefined) {
      fields.push("pre_call_status = ?");
      args.push(input.preCallStatus);
    }
    if (input.postCallStatus !== undefined) {
      fields.push("post_call_status = ?");
      args.push(input.postCallStatus);
    }
    if (input.notes !== undefined) {
      fields.push("notes = ?");
      args.push(input.notes);
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      args.push(existing.id);
      await db.execute({
        sql: `UPDATE appointments SET ${fields.join(", ")} WHERE id = ?`,
        args,
      });
    }

    const refreshed = await findAppointmentById(existing.id);
    if (!refreshed) throw new Error("Appointment vanished after update");
    return refreshed;
  }

  const id = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO appointments
            (id, setter_id, google_event_id, client_name, client_email, scheduled_at, pre_call_status, post_call_status, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.setterId,
      input.googleEventId,
      input.clientName ?? null,
      input.clientEmail ?? null,
      input.scheduledAt ?? null,
      input.preCallStatus ?? "not_called",
      input.postCallStatus ?? "not_called",
      input.notes ?? null,
    ],
  });

  const created = await findAppointmentById(id);
  if (!created) throw new Error("Appointment insert did not persist");
  return created;
}

export async function deleteAppointment(
  setterId: string,
  googleEventId: string
): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "DELETE FROM appointments WHERE setter_id = ? AND google_event_id = ?",
    args: [setterId, googleEventId],
  });
  return (result.rowsAffected ?? 0) > 0;
}

export function isPreCallStatus(v: unknown): v is PreCallStatus {
  return typeof v === "string" && (PRE_CALL_STATUSES as string[]).includes(v);
}

export function isPostCallStatus(v: unknown): v is PostCallStatus {
  return typeof v === "string" && (POST_CALL_STATUSES as string[]).includes(v);
}

// ── Shared UI labels + badge styling ──────────────────────────────────────
// Kept here (not in a component file) so every surface — setter portal,
// closer calendar, admin calendar — renders identical strings and colors.

export const PRE_CALL_LABELS: Record<PreCallStatus, string> = {
  not_called: "Not called",
  auto_confirmed: "Not triaged / Confirmed via text",
  auto_no_answer: "No answer / Not confirmed via text",
  triaged_confirmed: "Triaged / Call confirmed",
  confirmed: "Confirmed",
  no_answer: "No answer on call",
  voicemail: "Voicemail",
  rescheduled: "Rescheduled",
  cancelled: "Cancelled",
};

export const POST_CALL_LABELS: Record<PostCallStatus, string> = {
  not_called: "Not called",
  followed_up: "Followed up",
  needs_followup: "Needs follow-up",
  qualified: "Qualified",
  disqualified: "Disqualified",
  no_answer: "No answer",
};

export const PRE_CALL_BADGE: Record<PreCallStatus, string> = {
  not_called: "bg-muted/60 text-muted-foreground",
  auto_confirmed: "bg-teal-500/15 text-teal-700 dark:text-teal-400",
  auto_no_answer: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  triaged_confirmed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  confirmed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  no_answer: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  voicemail: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  rescheduled: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400",
  cancelled: "bg-red-500/15 text-red-700 dark:text-red-400",
};

export const POST_CALL_BADGE: Record<PostCallStatus, string> = {
  not_called: "bg-muted/60 text-muted-foreground",
  followed_up: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  needs_followup: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  qualified: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  disqualified: "bg-red-500/15 text-red-700 dark:text-red-400",
  no_answer: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
};

/**
 * Public-safe view of an appointment for closer + admin calendar surfaces.
 * Includes the setter's display name so the UI can show attribution without
 * joining setters on the client.
 */
export interface AppointmentIndexEntry {
  googleEventId: string;
  setterId: string;
  setterName: string | null;
  clientName: string | null;
  clientEmail: string | null;
  scheduledAt: string | null;
  preCallStatus: PreCallStatus;
  postCallStatus: PostCallStatus;
  notes: string | null;
  updatedAt: string;
}

/**
 * Build a per-event index of setter claims for closer/admin views.
 *
 * When multiple setters have claimed the same event, the most recently touched
 * claim wins — matches the attribution rule used by reassignDealsForEvent so
 * the UI and the deal's setter_id agree on who's credited.
 */
export async function getAppointmentsIndex(): Promise<Record<string, AppointmentIndexEntry>> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute(
    `SELECT a.id, a.google_event_id, a.setter_id, a.client_name, a.client_email,
            a.scheduled_at, a.pre_call_status, a.post_call_status, a.notes, a.updated_at,
            c.display_name AS setter_name
       FROM appointments a
       LEFT JOIN closers c ON c.id = a.setter_id
       ORDER BY a.updated_at DESC`
  );

  const index: Record<string, AppointmentIndexEntry> = {};
  for (const row of result.rows) {
    const eventId = String(row.google_event_id);
    // Rows are sorted newest-first; the first one we see for a given event wins.
    if (index[eventId]) continue;
    index[eventId] = {
      googleEventId: eventId,
      setterId: String(row.setter_id),
      setterName: row.setter_name != null ? String(row.setter_name) : null,
      clientName: row.client_name != null ? String(row.client_name) : null,
      clientEmail: row.client_email != null ? String(row.client_email) : null,
      scheduledAt: row.scheduled_at != null ? String(row.scheduled_at) : null,
      preCallStatus: String(row.pre_call_status) as PreCallStatus,
      postCallStatus: String(row.post_call_status) as PostCallStatus,
      notes: row.notes != null ? String(row.notes) : null,
      updatedAt: String(row.updated_at),
    };
  }
  return index;
}
