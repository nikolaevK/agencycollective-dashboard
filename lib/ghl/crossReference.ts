// Cross-reference: turns a Google Calendar event into the matching GHL
// contact via a composite-key join.
//
// Why composite, not id-based: GHL's `/calendars/events` payload doesn't
// expose the synced Google Calendar event id. So instead we match on
// (title, startTime, endTime) — when GHL syncs an appointment to Google,
// these are preserved exactly. Strict enough that collisions across
// distinct contacts are vanishingly rare; works for all appointment types
// (virtual, phone, in-person).
//
// Email-based matching is intentionally not used here — it produced false
// positives in production.

import { getAppointmentsByContact } from "./calendars";
import { getContactById } from "./contacts";
import type { GhlContact, GhlContactAppointment, GhlContactRef } from "@/types/ghl";

function toRef(c: GhlContact | null): GhlContactRef | null {
  if (!c) return null;
  const composedName = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return {
    id: c.id,
    name: c.contactName?.trim() || composedName || null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    tags: c.tags,
    source: c.source ?? null,
  };
}

/**
 * Composite key shared by both sides of the join. Title is lowercased and
 * trimmed; times are millisecond timestamps (or 0 if missing/malformed).
 * Returns null when the event is too sparse to join on.
 */
export function eventCompositeKey(input: {
  title: string | null | undefined;
  startTime: string | null | undefined;
  endTime: string | null | undefined;
}): string | null {
  if (!input.startTime) return null;
  const startMs = Date.parse(input.startTime);
  if (!Number.isFinite(startMs)) return null;
  const endMs = input.endTime ? Date.parse(input.endTime) : 0;
  const title = (input.title ?? "").trim().toLowerCase();
  return `${title}|${startMs}|${Number.isFinite(endMs) ? endMs : 0}`;
}

export interface CrossReferenceEvent {
  /** The Google Calendar event id — used as the response key, not for matching. */
  id: string;
  title: string;
  startTime: string;
  endTime: string;
}

export interface CrossReferenceResult {
  byGoogleEventId: Record<string, GhlContactRef | null>;
}

export async function buildCrossReference(
  events: CrossReferenceEvent[]
): Promise<CrossReferenceResult> {
  const result: CrossReferenceResult = { byGoogleEventId: {} };
  if (events.length === 0) return result;

  const apptsByContact = await getAppointmentsByContact().catch(() => new Map());

  // Build the GHL-side index: compositeKey → contactId. Done once per
  // call; the bulk appointment data is cached so this is cheap.
  const keyToContact = new Map<string, string>();
  for (const [contactId, appts] of apptsByContact as Map<string, GhlContactAppointment[]>) {
    for (const appt of appts) {
      const key = eventCompositeKey({
        title: appt.title,
        startTime: appt.startTime,
        endTime: appt.endTime,
      });
      if (key) keyToContact.set(key, contactId);
    }
  }

  // Resolve the contact behind each calendar event.
  const neededContactIds = new Set<string>();
  const eventToContactId = new Map<string, string>();
  for (const ev of events) {
    result.byGoogleEventId[ev.id] = null;
    const key = eventCompositeKey(ev);
    if (!key) continue;
    const cid = keyToContact.get(key);
    if (cid) {
      eventToContactId.set(ev.id, cid);
      neededContactIds.add(cid);
    }
  }

  // Fan out unique contact lookups in parallel.
  const contactEntries = await Promise.all(
    Array.from(neededContactIds).map(async (id) => {
      const c = await getContactById(id).catch(() => null);
      return [id, c] as const;
    })
  );
  const contactsById = new Map(contactEntries);

  for (const [eventId, cid] of eventToContactId) {
    result.byGoogleEventId[eventId] = toRef(contactsById.get(cid) ?? null);
  }

  return result;
}
