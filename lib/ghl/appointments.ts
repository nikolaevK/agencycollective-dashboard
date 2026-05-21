// Single-appointment GHL operations: status push (PUT), status read (GET),
// and the composite-key resolver that turns a Google event id into a GHL
// appointment id the first time we see one. Bulk listing lives in
// `./calendars.ts` — this file is for one-event-at-a-time sync paths.

import cache from "@/lib/cache";
import { ghlRequest, getGhlConfig } from "./client";
import {
  DEFAULT_SUB_ACCOUNT_ID,
  getConfiguredSubAccountIds,
  type GhlSubAccountId,
} from "./subAccounts";
import { pickStr } from "./util";
import {
  appointmentsByContactCacheKey,
  getAppointmentsByContact,
} from "./calendars";
import { eventCompositeKey } from "./crossReference";
import { getUserMap } from "./users";
import { getDb, ensureMigrated } from "../db";

// Per GHL v2 docs (marketplace.gohighlevel.com/docs/ghl/calendars/edit-appointment),
// the Version header for /calendars/events/appointments/* is 2023-02-21.
// Sending the older default (2021-07-28) made PUT return 200 with the body
// silently ignored — appointments never actually updated. 2023-02-21 persists.
const VERSION = "2023-02-21";

// Canonical GHL appointment statuses (v2 enum). The dashboard only cares
// about showed/noshow; confirmed is the canonical "scheduled, not yet
// attended" state we PUT when a closer unselects.
export type GhlAppointmentStatus =
  | "new"
  | "confirmed"
  | "cancelled"
  | "showed"
  | "noshow"
  | "invalid";

export interface GhlAppointmentSnapshot {
  id: string;
  appointmentStatus: GhlAppointmentStatus | null;
  contactId: string | null;
  calendarId: string | null;
  assignedUserId: string | null;
  title: string | null;
  startTime: string | null;
  endTime: string | null;
}

function isGhlAppointmentStatus(v: unknown): v is GhlAppointmentStatus {
  return (
    typeof v === "string" &&
    (v === "new" ||
      v === "confirmed" ||
      v === "cancelled" ||
      v === "showed" ||
      v === "noshow" ||
      v === "invalid")
  );
}

function unwrapAppointment(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.appointment && typeof obj.appointment === "object") {
    return obj.appointment as Record<string, unknown>;
  }
  if (obj.event && typeof obj.event === "object") {
    return obj.event as Record<string, unknown>;
  }
  return obj;
}

function normAppointment(raw: Record<string, unknown>): GhlAppointmentSnapshot {
  const status = pickStr(raw, "appointmentStatus", "appointment_status", "status");
  return {
    id: pickStr(raw, "id", "_id") ?? "",
    appointmentStatus: status && isGhlAppointmentStatus(status) ? status : null,
    contactId: pickStr(raw, "contactId", "contact_id", "contact.id"),
    calendarId: pickStr(raw, "calendarId", "calendar_id", "calendar.id"),
    assignedUserId: pickStr(raw, "assignedUserId", "assigned_user_id", "assignedTo", "assigned_to"),
    title: pickStr(raw, "title"),
    startTime: pickStr(raw, "startTime", "start_time", "startDate", "start"),
    endTime: pickStr(raw, "endTime", "end_time", "endDate", "end"),
  };
}

/** GET a single GHL appointment by its GHL appointment id. */
export async function getGhlAppointment(
  ghlAppointmentId: string,
  subAccountId: GhlSubAccountId = DEFAULT_SUB_ACCOUNT_ID
): Promise<GhlAppointmentSnapshot | null> {
  const raw = await ghlRequest<unknown>(
    `/calendars/events/appointments/${encodeURIComponent(ghlAppointmentId)}`,
    { version: VERSION, subAccountId }
  );
  const inner = unwrapAppointment(raw);
  if (!inner) return null;
  const snap = normAppointment(inner);
  return snap.id ? snap : null;
}

/** PUT a new appointmentStatus on a GHL appointment. Returns the post-write
 *  snapshot as reported by the response (best-effort — we still verify by
 *  re-GET upstream because GHL's PUT response shape varies).
 *
 *  GHL v2's PUT silently no-ops when the body omits identity fields. We
 *  pre-fetch the appointment and round-trip the canonical fields with the
 *  new appointmentStatus swapped in. One extra GET per write — acceptable
 *  cost for writes that actually persist. */
export async function updateGhlAppointmentStatus(
  ghlAppointmentId: string,
  status: GhlAppointmentStatus,
  subAccountId: GhlSubAccountId = DEFAULT_SUB_ACCOUNT_ID
): Promise<GhlAppointmentSnapshot | null> {
  const current = await getGhlAppointment(ghlAppointmentId, subAccountId);
  const body: Record<string, unknown> = { appointmentStatus: status };
  if (current?.calendarId) body.calendarId = current.calendarId;
  if (current?.startTime) body.startTime = current.startTime;
  if (current?.endTime) body.endTime = current.endTime;
  if (current?.title) body.title = current.title;
  if (current?.assignedUserId) body.assignedUserId = current.assignedUserId;

  const raw = await ghlRequest<unknown>(
    `/calendars/events/appointments/${encodeURIComponent(ghlAppointmentId)}`,
    {
      method: "PUT",
      body,
      version: VERSION,
      subAccountId,
    }
  );

  // Bust THIS sub-account's bulk appointments cache so the next
  // /api/calendar/attendance read sees the new status instead of a 5-min
  // stale value. Without this, the sync chip flips back to "out of sync"
  // on the next refetch because the drift detector compares link.ghl_status
  // (fresh) against the cached bulk listing (still showing the pre-PUT value).
  try {
    const { locationId } = getGhlConfig(subAccountId);
    cache.delete(appointmentsByContactCacheKey(subAccountId, locationId));
  } catch {
    // Sub-account env missing — caller already handled the unavailable path
  }

  const inner = unwrapAppointment(raw);
  if (!inner) return null;
  return normAppointment(inner);
}

export interface ResolvedGhlAppointment extends GhlAppointmentSnapshot {
  /** Which sub-account this appointment belongs to. Persisted on the link
   *  row so subsequent sync ops route to the right PIT without re-resolving. */
  subAccountId: GhlSubAccountId;
}

/**
 * Resolve a Google Calendar event id to its GHL appointment id via the
 * composite key `(title|startMs|endMs)` — the same approach `crossReference`
 * uses, because GHL's bulk events listing doesn't expose the synced Google
 * event id reliably. The match is cached upstream (5 min) so this is cheap
 * for the second+ lookup.
 *
 * When `subAccountId` is supplied, only that account's bulk listing is
 * searched. Otherwise, every configured sub-account is searched in parallel
 * and the first match wins; the winner's sub-account id is stamped onto the
 * returned snapshot so downstream writes route to the right PIT. Both-account
 * matches on the same composite key are rare (would require identical
 * title+start+end across two distinct tenants) — we log and keep the first.
 *
 * Returns null when no GHL appointment matches the composite key across the
 * searched accounts, or when GHL is not configured.
 */
export async function resolveGhlAppointmentForGoogleEvent(input: {
  googleEventId: string;
  title: string | null;
  startTime: string | null;
  endTime: string | null;
  subAccountId?: GhlSubAccountId;
}): Promise<ResolvedGhlAppointment | null> {
  const key = eventCompositeKey({
    title: input.title,
    startTime: input.startTime,
    endTime: input.endTime,
  });
  if (!key) return null;

  const accountsToSearch: GhlSubAccountId[] = input.subAccountId
    ? [input.subAccountId]
    : getConfiguredSubAccountIds();
  if (accountsToSearch.length === 0) return null;

  const settled = await Promise.allSettled(
    accountsToSearch.map(async (sub) => {
      const apptsByContact = await getAppointmentsByContact(sub);
      return { sub, apptsByContact };
    })
  );

  let winner: ResolvedGhlAppointment | null = null;
  for (const r of settled) {
    if (r.status !== "fulfilled") continue;
    const { sub, apptsByContact } = r.value;
    for (const [, appts] of apptsByContact) {
      for (const appt of appts) {
        const candidateKey = eventCompositeKey({
          title: appt.title,
          startTime: appt.startTime,
          endTime: appt.endTime,
        });
        if (candidateKey !== key || !appt.id) continue;
        const match: ResolvedGhlAppointment = {
          id: appt.id,
          appointmentStatus: isGhlAppointmentStatus(appt.appointmentStatus)
            ? appt.appointmentStatus
            : null,
          contactId: appt.contactId ?? null,
          calendarId: appt.calendarId ?? null,
          assignedUserId: appt.assignedUserId ?? null,
          title: appt.title ?? null,
          startTime: appt.startTime ?? null,
          endTime: appt.endTime ?? null,
          subAccountId: sub,
        };
        if (!winner) {
          winner = match;
        } else {
          // Composite-key collision across sub-accounts — keep the first
          // (matches single-account behavior) and surface the conflict so
          // ops can rename one of the events if it matters.
          console.warn(
            `[ghl-appointments] composite-key collision for googleEventId=${input.googleEventId}: matched both sub=${winner.subAccountId} (appt=${winner.id}) and sub=${sub} (appt=${match.id}); keeping first`
          );
        }
      }
    }
  }

  return winner;
}

/**
 * Map a GHL user id (from `appointment.assignedUserId`) to a dashboard
 * closer id by matching their display names case-insensitively.
 *
 * Why name-matching: per agency setup, every GHL user has an exact
 * counterpart in the dashboard `closers` table with the same display name.
 * We don't store a `ghl_user_id` column so the resolver leans on names.
 *
 * The GHL user catalog is per-sub-account, but the dashboard closers table
 * is shared (same humans cover both accounts), so name resolution is global
 * once we've pulled the right account's user roster.
 *
 * Returns null if the GHL user has no name, no closer matches, or GHL is
 * unreachable. Callers should log and skip the write rather than guess
 * attribution.
 */
let _closerNameMapCache: { byNormalizedName: Map<string, string>; cachedAt: number } | null = null;
const CLOSER_NAME_CACHE_MS = 5 * 60 * 1000;

async function getCloserNameMap(): Promise<Map<string, string>> {
  if (_closerNameMapCache && Date.now() - _closerNameMapCache.cachedAt < CLOSER_NAME_CACHE_MS) {
    return _closerNameMapCache.byNormalizedName;
  }
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute("SELECT id, display_name FROM closers WHERE status = 'active'");
  const map = new Map<string, string>();
  for (const row of result.rows) {
    const name = String(row.display_name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!name) continue;
    // First entry wins on collisions; subsequent duplicates are silently
    // dropped. The console log surfaces the conflict so admins can rename.
    if (map.has(name)) {
      console.warn(
        `[ghl-sync] Closer name collision on "${name}" — keeping id=${map.get(name)}, skipping id=${row.id}`
      );
      continue;
    }
    map.set(name, String(row.id));
  }
  _closerNameMapCache = { byNormalizedName: map, cachedAt: Date.now() };
  return map;
}

export async function resolveCloserByGhlAssignedUser(
  assignedUserId: string | null | undefined,
  subAccountId: GhlSubAccountId = DEFAULT_SUB_ACCOUNT_ID
): Promise<string | null> {
  if (!assignedUserId) return null;
  try {
    const userMap = await getUserMap(subAccountId);
    const ghlUser = userMap[assignedUserId];
    if (!ghlUser?.name) return null;
    const normalized = ghlUser.name.trim().toLowerCase().replace(/\s+/g, " ");
    if (!normalized) return null;
    const closerMap = await getCloserNameMap();
    return closerMap.get(normalized) ?? null;
  } catch (err) {
    console.error("[ghl-sync] resolveCloserByGhlAssignedUser failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
