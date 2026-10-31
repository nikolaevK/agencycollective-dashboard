import crypto from "crypto";
import { getDb, ensureMigrated } from "./db";
import type { Row } from "@libsql/client";
import {
  type PreCallStatus,
  type PostCallStatus,
  type SetterTier,
  isSetterTier,
} from "./appointmentRules";

export * from "./appointmentRules";

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
  /** Tier the setter has claimed for this appointment, or null if not yet
   *  selected. While null, no setter credit flows through to any linked deal. */
  setterTier: SetterTier | null;
  /** ISO timestamp of when `setterTier` was last set. Useful for audit. */
  setterTierAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToAppointment(row: Row): AppointmentRecord {
  const tierRaw = row.setter_tier != null ? String(row.setter_tier) : null;
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
    setterTier: isSetterTier(tierRaw) ? tierRaw : null,
    setterTierAt: row.setter_tier_at != null ? String(row.setter_tier_at) : null,
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
  /** Pass `undefined` to leave unchanged. Pass `null` to clear the tier
   *  (rescinds setter credit on linked deals). Pass a tier letter to set. */
  setterTier?: SetterTier | null;
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
    if (input.setterTier !== undefined) {
      // Pair tier writes with their timestamp so audit/admin views can show
      // when the setter committed credit. Clearing tier also clears the ts.
      fields.push("setter_tier = ?");
      args.push(input.setterTier);
      fields.push("setter_tier_at = ?");
      args.push(input.setterTier == null ? null : new Date().toISOString());
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
  const initialTier = input.setterTier ?? null;
  await db.execute({
    sql: `INSERT INTO appointments
            (id, setter_id, google_event_id, client_name, client_email, scheduled_at, pre_call_status, post_call_status, notes, setter_tier, setter_tier_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      initialTier,
      initialTier == null ? null : new Date().toISOString(),
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
  setterTier: SetterTier | null;
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
            a.scheduled_at, a.pre_call_status, a.post_call_status, a.notes, a.setter_tier, a.updated_at,
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
    const tierRaw = row.setter_tier != null ? String(row.setter_tier) : null;
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
      setterTier: isSetterTier(tierRaw) ? tierRaw : null,
      updatedAt: String(row.updated_at),
    };
  }
  return index;
}
