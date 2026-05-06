import { ghlRequest, getGhlConfig, describeError } from "./client";
import { pickStr, pickIso, cachedSingleflight } from "./util";
import type { GhlContactAppointment } from "@/types/ghl";

const TTL_EVENTS = 300; // 5 min
const VERSION = "2023-02-21";
// Memoize the resolved /calendars list path across cache misses so we don't
// re-probe `/calendars/` then `/calendars` on every refresh.
let resolvedCalendarsPath: string | null = null;

// 6 months past + 3 months future. Wide enough to cover almost any "find
// dropped leads" hunt; narrow enough to keep the events-fetch reasonable
// even on busy locations.
const PAST_WINDOW_DAYS = 180;
const FUTURE_WINDOW_DAYS = 90;

function normEvent(raw: Record<string, unknown>): GhlContactAppointment {
  return {
    id: pickStr(raw, "id", "_id") ?? "",
    title: pickStr(raw, "title"),
    contactId: pickStr(raw, "contactId", "contact_id", "contact.id") ?? "",
    calendarId: pickStr(raw, "calendarId", "calendar_id", "calendar.id"),
    locationId: pickStr(raw, "locationId", "location_id"),
    // GHL returns these as ISO strings on most endpoints but as Unix ms on
    // some — pickIso normalizes both shapes to ISO.
    startTime: pickIso(raw, "startTime", "start_time", "startDate", "start"),
    endTime: pickIso(raw, "endTime", "end_time", "endDate", "end"),
    appointmentStatus: pickStr(raw, "appointmentStatus", "appointment_status", "status"),
    assignedUserId: pickStr(raw, "assignedUserId", "assigned_user_id", "assignedTo", "assigned_to"),
    notes: pickStr(raw, "notes"),
    address: pickStr(raw, "address"),
    meetingLocationType: pickStr(raw, "meetingLocationType", "meeting_location_type"),
    // GHL exposes the synced Google Calendar event ID under several names
    // depending on integration version. Try them all; null if unavailable
    // (in which case the cross-reference falls back to email matching).
    googleEventId: pickStr(
      raw,
      "googleEventId",
      "google_event_id",
      "googleId",
      "google_id",
      "externalId",
      "external_id",
      "meta.externalId",
      "meta.googleEventId"
    ),
  };
}

async function listCalendarIds(locationId: string): Promise<string[]> {
  // Fast path: stick with the previously-working endpoint.
  if (resolvedCalendarsPath) {
    try {
      return await fetchCalendarIdsAt(resolvedCalendarsPath, locationId);
    } catch (err) {
      // Path failed — clear the memo and re-probe below.
      console.error(
        `[ghl-calendars] cached path ${resolvedCalendarsPath} failed, re-probing:`,
        err instanceof Error ? err.message : err
      );
      resolvedCalendarsPath = null;
    }
  }

  for (const p of ["/calendars/", "/calendars"]) {
    try {
      const ids = await fetchCalendarIdsAt(p, locationId);
      // Remember this path even if it returned an empty list, so future
      // calls don't keep probing.
      resolvedCalendarsPath = p;
      return ids;
    } catch (err) {
      console.error(`[ghl-calendars] ${p} failed:`, describeError(err));
    }
  }
  return [];
}

async function fetchCalendarIdsAt(path: string, locationId: string): Promise<string[]> {
  const raw = await ghlRequest<unknown>(path, {
    query: { locationId },
    version: VERSION,
  });
  const list = extractArray(raw, "calendars");
  return list.map((c) => pickStr(c, "id", "_id") ?? "").filter(Boolean);
}

function extractArray(raw: unknown, key: string): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const v = obj[key];
    if (Array.isArray(v)) return v;
    // Some GHL endpoints wrap under { data: [...] }.
    if (Array.isArray(obj.data)) return obj.data as unknown[];
  }
  return [];
}

async function fetchEventsForCalendar(
  locationId: string,
  calendarId: string,
  startTime: number,
  endTime: number
): Promise<GhlContactAppointment[]> {
  // GHL `/calendars/events` returns the entire window in one shot — no
  // limit/page params (sending them returned 422 in production). Times are
  // accepted as Unix milliseconds. We pass them directly.
  const raw = await ghlRequest<unknown>("/calendars/events", {
    query: {
      locationId,
      calendarId,
      startTime,
      endTime,
    },
    version: VERSION,
  });
  const list = extractArray(raw, "events");
  return list.map((e) => normEvent(e as Record<string, unknown>));
}

/**
 * Bulk-fetch every appointment in the configured window, grouped by
 * contactId. Replaces the N+1 per-contact `/contacts/{id}/appointments`
 * fan-out in the contacts list — for 5000 contacts this drops the page
 * load from minutes to seconds.
 *
 * GHL's `/calendars/events` requires either userId, groupId, or calendarId
 * alongside locationId, so we list calendars first and iterate. Most
 * agencies have a handful of calendars, making this 1+N(calendars) calls
 * instead of N(contacts).
 */
export async function getAppointmentsByContact(): Promise<
  Map<string, GhlContactAppointment[]>
> {
  const { locationId } = getGhlConfig();
  return cachedSingleflight(`ghl:appts-by-contact:${locationId}`, TTL_EVENTS, async () => {
    const map = new Map<string, GhlContactAppointment[]>();

    const calendarIds = await listCalendarIds(locationId);
    if (calendarIds.length === 0) return map;

    const now = Date.now();
    const startTime = now - PAST_WINDOW_DAYS * 86_400_000;
    const endTime = now + FUTURE_WINDOW_DAYS * 86_400_000;

    // Run all calendars in parallel — each call is one shot with no
    // pagination, so concurrency just collapses wall-clock from N×rtt to rtt.
    const settled = await Promise.allSettled(
      calendarIds.map((id) =>
        fetchEventsForCalendar(locationId, id, startTime, endTime)
      )
    );
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      if (r.status === "rejected") {
        console.error(
          `[ghl-calendars] events fetch failed for calendar ${calendarIds[i]}:`,
          describeError(r.reason)
        );
        continue;
      }
      for (const ev of r.value) {
        if (!ev.contactId) continue;
        const list = map.get(ev.contactId) ?? [];
        list.push(ev);
        map.set(ev.contactId, list);
      }
    }

    return map;
  });
}
