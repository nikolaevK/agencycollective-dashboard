import { getDb, ensureMigrated } from "./db";
import {
  DEFAULT_SUB_ACCOUNT_ID,
  isValidSubAccountId,
  type GhlSubAccountId,
} from "./ghl/subAccounts";

// Bridges a Google Calendar event id (the dashboard's universal key for an
// appointment) to its corresponding GHL appointment id, plus the most-recent
// observed status on each side. Presence of a row marks an event as
// GHL-linked; absence means "this is a non-GHL event, skip the sync code
// entirely." `event_attendance` stays the canonical source of truth for the
// dashboard side — `dashboard_status` here is denormalized so the link row
// alone tells us whether the two systems agree.
//
// `ghl_sub_account_id` records which GHL sub-account owns the linked
// appointment. Stamped once at discovery time and read on every push/pull
// to route to the right PIT — sub-accounts are never re-resolved.

export type SyncState = "synced" | "pending" | "out_of_sync";
export type DashboardStatus = "showed" | "no_show" | null;

export interface GhlAppointmentLink {
  googleEventId: string;
  ghlAppointmentId: string;
  ghlContactId: string | null;
  ghlCalendarId: string | null;
  /** Which GHL sub-account this link belongs to. Existing rows backfilled
   *  to 'peptide' (the original sole sub-account) by the migration; new
   *  rows always supply the value at insert time. */
  subAccountId: GhlSubAccountId;
  dashboardStatus: DashboardStatus;
  ghlStatus: string | null;
  syncState: SyncState;
  lastPushAt: string | null;
  lastPullAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UpsertLinkInput {
  googleEventId: string;
  ghlAppointmentId: string;
  ghlContactId?: string | null;
  ghlCalendarId?: string | null;
  subAccountId: GhlSubAccountId;
}

function rowToLink(row: Record<string, unknown>): GhlAppointmentLink {
  const rawSub = row.ghl_sub_account_id;
  // Defense in depth: the migration's backfill covers every existing row,
  // but a row written outside the orchestrator with a NULL/unknown id should
  // still be readable. Fall back to the default sub-account in that case.
  const subAccountId: GhlSubAccountId = isValidSubAccountId(rawSub)
    ? rawSub
    : DEFAULT_SUB_ACCOUNT_ID;
  return {
    googleEventId: String(row.google_event_id),
    ghlAppointmentId: String(row.ghl_appointment_id),
    ghlContactId: row.ghl_contact_id != null ? String(row.ghl_contact_id) : null,
    ghlCalendarId: row.ghl_calendar_id != null ? String(row.ghl_calendar_id) : null,
    subAccountId,
    dashboardStatus: (row.dashboard_status as DashboardStatus) ?? null,
    ghlStatus: row.ghl_status != null ? String(row.ghl_status) : null,
    syncState: String(row.sync_state ?? "synced") as SyncState,
    lastPushAt: row.last_push_at != null ? String(row.last_push_at) : null,
    lastPullAt: row.last_pull_at != null ? String(row.last_pull_at) : null,
    lastError: row.last_error != null ? String(row.last_error) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function findLinkByGoogleEventId(
  googleEventId: string
): Promise<GhlAppointmentLink | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM ghl_appointment_links WHERE google_event_id = ?",
    args: [googleEventId],
  });
  return result.rows[0] ? rowToLink(result.rows[0] as Record<string, unknown>) : null;
}

export async function findLinkByGhlAppointmentId(
  ghlAppointmentId: string
): Promise<GhlAppointmentLink | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM ghl_appointment_links WHERE ghl_appointment_id = ?",
    args: [ghlAppointmentId],
  });
  return result.rows[0] ? rowToLink(result.rows[0] as Record<string, unknown>) : null;
}

export async function listLinksByGoogleEventIds(
  googleEventIds: string[]
): Promise<Record<string, GhlAppointmentLink>> {
  if (googleEventIds.length === 0) return {};
  await ensureMigrated();
  const db = getDb();
  const placeholders = googleEventIds.map(() => "?").join(",");
  const result = await db.execute({
    sql: `SELECT * FROM ghl_appointment_links WHERE google_event_id IN (${placeholders})`,
    args: googleEventIds,
  });
  const map: Record<string, GhlAppointmentLink> = {};
  for (const row of result.rows) {
    const link = rowToLink(row as Record<string, unknown>);
    map[link.googleEventId] = link;
  }
  return map;
}

export async function listAllLinks(): Promise<GhlAppointmentLink[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute("SELECT * FROM ghl_appointment_links");
  return result.rows.map((row) => rowToLink(row as Record<string, unknown>));
}

/**
 * Persist the (googleEventId ↔ ghlAppointmentId) mapping. Called on first
 * resolution via composite-key matching. Idempotent: re-upserting with the
 * same pair just refreshes contact/calendar metadata.
 *
 * UNIQUE collisions: the `ghl_appointment_id` column is also UNIQUE, so if
 * two different Google events ever resolve to the same GHL appointment id
 * (rare — would require identical title+start+end across calendars), the
 * second INSERT errors. We swallow that and return the existing row so the
 * sync layer can carry on; the second Google event won't auto-sync, but the
 * out-of-sync chip is still surfaced via drift detection on the next read.
 *
 * Cross-sub-account collisions: extraordinarily unlikely (GHL appointment
 * ids are globally unique within GHL), but if a row already exists for the
 * same ghl_appointment_id under a different sub-account, we log and keep
 * the original — same convention as the single-account collision path.
 */
export async function upsertLink(input: UpsertLinkInput): Promise<GhlAppointmentLink> {
  await ensureMigrated();
  const db = getDb();
  try {
    await db.execute({
      sql: `INSERT INTO ghl_appointment_links
              (google_event_id, ghl_appointment_id, ghl_contact_id, ghl_calendar_id, ghl_sub_account_id)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(google_event_id)
            DO UPDATE SET
              ghl_appointment_id  = excluded.ghl_appointment_id,
              ghl_contact_id      = COALESCE(excluded.ghl_contact_id, ghl_appointment_links.ghl_contact_id),
              ghl_calendar_id     = COALESCE(excluded.ghl_calendar_id, ghl_appointment_links.ghl_calendar_id),
              ghl_sub_account_id  = excluded.ghl_sub_account_id,
              updated_at          = datetime('now')`,
      args: [
        input.googleEventId,
        input.ghlAppointmentId,
        input.ghlContactId ?? null,
        input.ghlCalendarId ?? null,
        input.subAccountId,
      ],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/UNIQUE constraint failed.*ghl_appointment_id/i.test(msg)) {
      const owned = await findLinkByGhlAppointmentId(input.ghlAppointmentId);
      if (owned) {
        // Cross-sub-account collision is rare (would require identical
        // ghl_appointment_id under two PITs — practically impossible since
        // GHL appointment ids are globally unique). When it does happen
        // it's almost certainly a misconfig (same PIT registered for both
        // sub-accounts). Same-sub collisions are routine (duplicate Google
        // events sharing title+time) and stay silent.
        if (owned.subAccountId !== input.subAccountId) {
          console.warn(
            `[ghl-links] cross-sub collision: ghl_appointment_id=${input.ghlAppointmentId} owned by sub=${owned.subAccountId}, refused for sub=${input.subAccountId}. Check that GHL_PIT and GHL_PIT_AGENCY point to different GHL locations.`
          );
        }
        return owned;
      }
    }
    throw err;
  }
  const link = await findLinkByGoogleEventId(input.googleEventId);
  if (!link) throw new Error("Link row vanished after upsert");
  return link;
}

interface UpdateSyncStateInput {
  googleEventId: string;
  dashboardStatus?: DashboardStatus;
  ghlStatus?: string | null;
  syncState: SyncState;
  bumpLastPush?: boolean;
  bumpLastPull?: boolean;
  // lastError is server-side diagnostic only — never surfaced to API
  // responses since GHL error bodies can echo PII.
  lastError?: string | null;
}

export async function updateLinkSyncState(input: UpdateSyncStateInput): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  const fields: string[] = ["sync_state = ?", "updated_at = datetime('now')"];
  const args: (string | null)[] = [input.syncState];

  if (input.dashboardStatus !== undefined) {
    fields.push("dashboard_status = ?");
    args.push(input.dashboardStatus);
  }
  if (input.ghlStatus !== undefined) {
    fields.push("ghl_status = ?");
    args.push(input.ghlStatus);
  }
  if (input.bumpLastPush) {
    fields.push("last_push_at = datetime('now')");
  }
  if (input.bumpLastPull) {
    fields.push("last_pull_at = datetime('now')");
  }
  if (input.lastError !== undefined) {
    fields.push("last_error = ?");
    args.push(input.lastError);
  }

  args.push(input.googleEventId);
  await db.execute({
    sql: `UPDATE ghl_appointment_links SET ${fields.join(", ")} WHERE google_event_id = ?`,
    args,
  });
}
