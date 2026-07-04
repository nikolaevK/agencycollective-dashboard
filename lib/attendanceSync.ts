// Attendance ↔ GHL sync orchestrator.
//
// The dashboard's authoritative state lives in `event_attendance`; this
// module's job is to keep GHL's `appointmentStatus` in step with it (and
// vice versa) without ever blocking a closer's interaction on GHL latency
// or availability.
//
// Two entry points:
//   - syncEventAttendanceToGhl: called immediately after a dashboard write.
//     PUTs the new status, then re-GETs to verify, then stamps sync_state.
//   - syncEventAttendanceFromGhl: called by the resync "Pull" button and the
//     calendar read merge. Reads GHL's current status, writes through to
//     event_attendance, and stamps sync_state.
//
// Non-GHL events: `ensureLinkForEvent` returns null and every sync call
// returns "non_ghl" early so the dashboard path stays identical to today.
//
// Multi-sub-account: discovery iterates every configured sub-account in
// parallel and stamps the winning sub-account onto the link row. Every
// subsequent push/pull reads that id and routes its PUT/GET to the right
// PIT — sub-accounts are never re-resolved.

import { describeError, isGhlConfigured } from "./ghl/client";
import {
  getGhlAppointment,
  updateGhlAppointmentStatus,
  resolveGhlAppointmentForGoogleEvent,
  resolveCloserByGhlAssignedUser,
  type GhlAppointmentStatus,
} from "./ghl/appointments";
import { isAnyGhlConfigured, type GhlSubAccountId } from "./ghl/subAccounts";
import {
  findLinkByGoogleEventId,
  upsertLink,
  updateLinkSyncState,
  type GhlAppointmentLink,
  type SyncState,
} from "./ghlAppointmentLinks";
import { type AttendanceStatus } from "./eventAttendance";
import { getDb, ensureMigrated } from "./db";
import { businessTodayYmd } from "./businessTime";

/**
 * Convenience wrapper for code paths that wrote an attendance row as a
 * side-effect (e.g. deal-creation auto-marking "showed") and want to
 * opportunistically push to GHL without coupling the host flow to GHL's
 * availability. Catches everything, logs, never throws.
 *
 * Without title/start/end coords this can only sync events that already
 * have a link row — first-sight composite-key resolution requires the
 * full triple. Untouched events still get caught by the drift detection
 * on the next calendar read.
 */
export async function bestEffortPushAttendanceToGhl(input: {
  googleEventId: string;
  dashboardStatus: "showed" | "no_show" | null;
  title?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}): Promise<void> {
  try {
    await syncEventAttendanceToGhl({
      evt: {
        googleEventId: input.googleEventId,
        title: input.title ?? null,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
      },
      dashboardStatus: input.dashboardStatus,
    });
  } catch (err) {
    // describeError trims to "<status> <message>" — keeps PII out of the
    // log (raw err.stack on a GhlApiError can echo the response body).
    console.error("[attendance-sync] best-effort push failed:", describeError(err));
  }
}

export type SyncOutcome =
  | "non_ghl" // No link, nothing to sync. Behave as today.
  | "synced" // Dashboard + GHL agree after the op.
  | "out_of_sync" // Op completed but verify said the two disagree.
  | "ghl_unavailable" // GHL not configured / unreachable.
  | "skipped" // No-op (e.g. already in sync, idempotent).
  | "needs_attribution"; // Pull found GHL showed/noshow but couldn't map an assigned user to a closer.

export interface SyncResult {
  outcome: SyncOutcome;
  syncState: SyncState | null;
  ghlStatus: string | null;
  dashboardStatus: AttendanceStatus | null;
  /** Which sub-account the link is bound to, when one exists. UI uses this
   *  to show the right badge in the out-of-sync chip. Null for non-GHL
   *  events. */
  subAccountId: GhlSubAccountId | null;
  error?: string;
}

/** Map dashboard attendance status to the GHL enum we'd PUT. Clearing
 *  attendance maps to "confirmed" — the canonical "scheduled, not yet
 *  attended" state, matching what a closer would do manually in GHL. */
function dashboardToGhlStatus(s: AttendanceStatus | null): GhlAppointmentStatus {
  if (s === "showed") return "showed";
  if (s === "no_show") return "noshow";
  return "confirmed";
}

/** Inverse mapping: only `showed`/`noshow` map back to dashboard attendance.
 *  Other GHL statuses (confirmed/cancelled/invalid/new) clear the dashboard
 *  row, because the dashboard only models the show/no-show axis. */
function ghlToDashboardStatus(s: string | null | undefined): AttendanceStatus | null {
  if (s === "showed") return "showed";
  if (s === "noshow") return "no_show";
  return null;
}

interface CalendarEventCoords {
  googleEventId: string;
  title: string | null;
  startTime: string | null;
  endTime: string | null;
}

/**
 * Make sure we have a link row for this event. If one exists, return it.
 * Otherwise try to resolve via composite-key match across every configured
 * GHL sub-account; if any returns a candidate, persist the link (stamping
 * the winning sub-account) and return it. Returns null when no GHL
 * counterpart exists in any account (= non-GHL event).
 */
export async function ensureLinkForEvent(
  evt: CalendarEventCoords
): Promise<GhlAppointmentLink | null> {
  const existing = await findLinkByGoogleEventId(evt.googleEventId);
  if (existing) return existing;

  if (!isAnyGhlConfigured()) return null;

  const resolved = await resolveGhlAppointmentForGoogleEvent({
    googleEventId: evt.googleEventId,
    title: evt.title,
    startTime: evt.startTime,
    endTime: evt.endTime,
  });
  if (!resolved?.id) return null;

  return upsertLink({
    googleEventId: evt.googleEventId,
    ghlAppointmentId: resolved.id,
    ghlContactId: resolved.contactId,
    ghlCalendarId: resolved.calendarId,
    subAccountId: resolved.subAccountId,
  });
}

/**
 * Push the current dashboard attendance (or its absence) to GHL, then
 * verify. Always run AFTER the dashboard write has succeeded so a GHL
 * failure can never lose the local mark.
 *
 * `dashboardStatus = null` means the closer unselected; we PUT confirmed.
 *
 * Routes the PUT to the link's stamped sub-account. If that sub-account is
 * no longer configured (env vars dropped, etc.), the push fails with a
 * descriptive out_of_sync outcome — surfaces as the red error chip in the UI.
 */
export async function syncEventAttendanceToGhl(input: {
  evt: CalendarEventCoords;
  dashboardStatus: AttendanceStatus | null;
}): Promise<SyncResult> {
  const link = await ensureLinkForEvent(input.evt);
  if (!link) {
    return {
      outcome: "non_ghl",
      syncState: null,
      ghlStatus: null,
      dashboardStatus: input.dashboardStatus,
      subAccountId: null,
    };
  }
  if (!isGhlConfigured(link.subAccountId)) {
    return {
      outcome: "ghl_unavailable",
      syncState: link.syncState,
      ghlStatus: link.ghlStatus,
      dashboardStatus: input.dashboardStatus,
      subAccountId: link.subAccountId,
    };
  }

  const target = dashboardToGhlStatus(input.dashboardStatus);

  // Idempotency: if both sides already agree on the target, skip the PUT.
  if (
    link.dashboardStatus === input.dashboardStatus &&
    link.ghlStatus === target &&
    link.syncState === "synced"
  ) {
    return {
      outcome: "skipped",
      syncState: "synced",
      ghlStatus: link.ghlStatus,
      dashboardStatus: input.dashboardStatus,
      subAccountId: link.subAccountId,
    };
  }

  // Note: we deliberately do NOT stamp `pending` before the PUT. Earlier we
  // did, but if the process died between the PUT and the verify-GET the row
  // stayed pending forever and the chip showed "Syncing…" indefinitely. The
  // UI tracks in-flight state client-side during the request, so the DB
  // sync_state only ever needs to reflect the final committed result.

  // GHL's PUT response already includes appointmentStatus in its body, so
  // we trust it as the verify signal — no second GET round-trip. If GHL
  // automation immediately overwrites our value (workflow trigger flipping
  // confirmed→cancelled etc.), the drift detector in /api/calendar/attendance
  // catches it on the next refetch and surfaces the chip.
  let observed: string | null = null;
  try {
    const updated = await updateGhlAppointmentStatus(
      link.ghlAppointmentId,
      target,
      link.subAccountId
    );
    observed = updated?.appointmentStatus ?? null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateLinkSyncState({
      googleEventId: input.evt.googleEventId,
      syncState: "out_of_sync",
      dashboardStatus: input.dashboardStatus,
      lastError: `[sub=${link.subAccountId}] ${msg}`,
    });
    return {
      outcome: "out_of_sync",
      syncState: "out_of_sync",
      ghlStatus: link.ghlStatus,
      dashboardStatus: input.dashboardStatus,
      subAccountId: link.subAccountId,
      error: msg,
    };
  }

  const matches = observed === target;
  await updateLinkSyncState({
    googleEventId: input.evt.googleEventId,
    syncState: matches ? "synced" : "out_of_sync",
    dashboardStatus: input.dashboardStatus,
    ghlStatus: observed,
    bumpLastPush: true,
    lastError: matches ? null : `verify mismatch: pushed=${target} observed=${observed ?? "null"}`,
  });

  return {
    outcome: matches ? "synced" : "out_of_sync",
    syncState: matches ? "synced" : "out_of_sync",
    ghlStatus: observed,
    dashboardStatus: input.dashboardStatus,
    subAccountId: link.subAccountId,
  };
}

/**
 * Read GHL's current status for this event and write it through to
 * event_attendance. Used by the "Pull" force-sync button and the calendar
 * read merge for events the dashboard hasn't yet marked.
 *
 * Attribution: `event_attendance` is keyed by (event, closer). For pulls,
 * we resolve the closer from GHL's `assignedUserId` via display-name match
 * against the link's sub-account user roster. If the name doesn't match any
 * dashboard closer, we log and skip the write — never guess.
 */
export async function syncEventAttendanceFromGhl(input: {
  evt: CalendarEventCoords;
  /** Closer to attribute the pulled status to. If omitted, resolved from
   *  GHL's assignedUserId via name. */
  closerId?: string;
}): Promise<SyncResult> {
  const link = await ensureLinkForEvent(input.evt);
  if (!link) {
    return {
      outcome: "non_ghl",
      syncState: null,
      ghlStatus: null,
      dashboardStatus: null,
      subAccountId: null,
    };
  }
  if (!isGhlConfigured(link.subAccountId)) {
    return {
      outcome: "ghl_unavailable",
      syncState: link.syncState,
      ghlStatus: link.ghlStatus,
      dashboardStatus: link.dashboardStatus,
      subAccountId: link.subAccountId,
    };
  }

  let snap: Awaited<ReturnType<typeof getGhlAppointment>> = null;
  try {
    snap = await getGhlAppointment(link.ghlAppointmentId, link.subAccountId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateLinkSyncState({
      googleEventId: input.evt.googleEventId,
      syncState: "out_of_sync",
      lastError: `[sub=${link.subAccountId}] ${msg}`,
    });
    return {
      outcome: "out_of_sync",
      syncState: "out_of_sync",
      ghlStatus: link.ghlStatus,
      dashboardStatus: link.dashboardStatus,
      subAccountId: link.subAccountId,
      error: msg,
    };
  }

  const ghlStatus = snap?.appointmentStatus ?? null;
  const targetDashboard = ghlToDashboardStatus(ghlStatus);

  if (targetDashboard === null) {
    // GHL moved off showed/noshow (now confirmed/cancelled/invalid/new).
    // Pull is an explicit reconciliation — clear every closer's mark for
    // this event so the dashboard mirrors GHL. The closer initiated this,
    // they're asserting GHL wins.
    await clearAllAttendanceForEvent(input.evt.googleEventId);
    await updateLinkSyncState({
      googleEventId: input.evt.googleEventId,
      syncState: "synced",
      dashboardStatus: null,
      ghlStatus,
      bumpLastPull: true,
      lastError: null,
    });
    return {
      outcome: "synced",
      syncState: "synced",
      ghlStatus,
      dashboardStatus: null,
      subAccountId: link.subAccountId,
    };
  }

  const attribution =
    input.closerId ??
    (await resolveCloserByGhlAssignedUser(snap?.assignedUserId, link.subAccountId));
  if (!attribution) {
    // Can't auto-attribute the new row — GHL's assignedUserId doesn't
    // resolve to any active closer by display name (or there is no
    // assigned user at all). Two sub-cases:
    //
    //   a) The event already has existing event_attendance row(s).
    //      Fall back to updating their show_status to match GHL.
    //      Attribution stays with whoever already had the row; admin can
    //      fix it with the calendar's reassign picker afterwards. This
    //      is what unblocks "pull a lead whose GHL assigned user isn't
    //      a closer in our DB" — status syncs even if attribution can't.
    //   b) No rows exist yet. Genuine needs_attribution — there's
    //      nothing to update, and we won't fabricate a row attributed
    //      to a guess.
    const updated = await updateExistingAttendanceStatus(
      input.evt.googleEventId,
      targetDashboard
    );
    if (updated > 0) {
      await updateLinkSyncState({
        googleEventId: input.evt.googleEventId,
        syncState: "synced",
        dashboardStatus: targetDashboard,
        ghlStatus,
        bumpLastPull: true,
        lastError: null,
      });
      return {
        outcome: "synced",
        syncState: "synced",
        ghlStatus,
        dashboardStatus: targetDashboard,
        subAccountId: link.subAccountId,
      };
    }
    await updateLinkSyncState({
      googleEventId: input.evt.googleEventId,
      syncState: "out_of_sync",
      ghlStatus,
      bumpLastPull: true,
      lastError: "no closer matched GHL assignedUserId by name",
    });
    return {
      outcome: "needs_attribution",
      syncState: "out_of_sync",
      ghlStatus,
      dashboardStatus: link.dashboardStatus,
      subAccountId: link.subAccountId,
      error: "no closer matched GHL assignedUserId by name",
    };
  }

  // Wipe existing rows AND insert the new one in a single transaction so a
  // crash between the two writes can't leave the event without any
  // attendance row. A teammate's stale opposite mark could otherwise
  // outweigh the resolved closer's pulled value when team-wide latest is
  // computed downstream.
  const startMs = input.evt.startTime ? Date.parse(input.evt.startTime) : NaN;
  const eventDate = Number.isNaN(startMs) ? null : businessTodayYmd(new Date(startMs));
  await replaceAttendanceForEvent(
    input.evt.googleEventId,
    attribution,
    targetDashboard,
    eventDate
  );
  await updateLinkSyncState({
    googleEventId: input.evt.googleEventId,
    syncState: "synced",
    dashboardStatus: targetDashboard,
    ghlStatus,
    bumpLastPull: true,
    lastError: null,
  });

  return {
    outcome: "synced",
    syncState: "synced",
    ghlStatus,
    dashboardStatus: targetDashboard,
    subAccountId: link.subAccountId,
  };
}

async function clearAllAttendanceForEvent(googleEventId: string): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: "DELETE FROM event_attendance WHERE google_event_id = ?",
    args: [googleEventId],
  });
}

async function replaceAttendanceForEvent(
  googleEventId: string,
  closerId: string,
  showStatus: AttendanceStatus,
  eventDateYmd: string | null = null
): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.batch(
    [
      {
        sql: "DELETE FROM event_attendance WHERE google_event_id = ?",
        args: [googleEventId],
      },
      {
        sql: `INSERT INTO event_attendance (google_event_id, closer_id, show_status, event_date)
              VALUES (?, ?, ?, ?)`,
        args: [googleEventId, closerId, showStatus, eventDateYmd],
      },
    ],
    "write"
  );
}

/**
 * Update show_status on every existing row for an event, preserving
 * closer_id. Used by Pull's status-only fallback when GHL's assigned
 * user can't be name-matched to a dashboard closer — we still want the
 * status to sync so the admin can reassign attribution separately via
 * the calendar picker.
 *
 * Returns the number of rows updated (0 means "no existing attendance
 * for this event").
 */
async function updateExistingAttendanceStatus(
  googleEventId: string,
  showStatus: AttendanceStatus
): Promise<number> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: `UPDATE event_attendance
             SET show_status = ?, updated_at = datetime('now')
           WHERE google_event_id = ?`,
    args: [showStatus, googleEventId],
  });
  return result.rowsAffected ?? 0;
}
