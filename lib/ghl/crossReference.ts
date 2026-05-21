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
//
// Multi-sub-account: every configured sub-account is searched in parallel
// and the first match wins; the winner's sub-account id is attached to the
// returned contact ref so the UI can render a sub-account badge and the
// chip can deep-link to the right contacts tab.

import { getAppointmentsByContact } from "./calendars";
import { getContactById } from "./contacts";
import {
  getConfiguredSubAccountIds,
  type GhlSubAccountId,
} from "./subAccounts";
import type { GhlContact, GhlContactAppointment, GhlContactRef } from "@/types/ghl";

function toRef(
  c: GhlContact | null,
  subAccountId: GhlSubAccountId
): GhlContactRef | null {
  if (!c) return null;
  const composedName = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return {
    id: c.id,
    name: c.contactName?.trim() || composedName || null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    tags: c.tags,
    source: c.source ?? null,
    subAccountId,
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

  const configuredSubs = getConfiguredSubAccountIds();
  if (configuredSubs.length === 0) {
    for (const ev of events) result.byGoogleEventId[ev.id] = null;
    return result;
  }

  // Pull each sub-account's bulk appointment listing in parallel. Each call
  // is cached + single-flighted so concurrent renders share the work.
  const apptsBySubResults = await Promise.allSettled(
    configuredSubs.map(async (sub) => {
      const map = await getAppointmentsByContact(sub);
      return { sub, map };
    })
  );

  // Per-sub composite-key → contactId index. We keep them per-sub instead of
  // merging, so that on a key collision across accounts we can attribute the
  // match to whichever sub-account scanned the calendar first (sub priority
  // = SUB_ACCOUNTS order in subAccounts.ts).
  const indexesBySub: Array<{
    sub: GhlSubAccountId;
    keyToContact: Map<string, string>;
  }> = [];
  for (const r of apptsBySubResults) {
    if (r.status !== "fulfilled") continue;
    const { sub, map } = r.value;
    const keyToContact = new Map<string, string>();
    for (const [contactId, appts] of map as Map<string, GhlContactAppointment[]>) {
      for (const appt of appts) {
        const key = eventCompositeKey({
          title: appt.title,
          startTime: appt.startTime,
          endTime: appt.endTime,
        });
        if (key && !keyToContact.has(key)) keyToContact.set(key, contactId);
      }
    }
    indexesBySub.push({ sub, keyToContact });
  }

  // Resolve the contact behind each calendar event — first sub with a hit
  // wins. Cross-sub collisions are logged once per event so ops can rename
  // if it matters.
  const needed = new Map<string, { contactId: string; sub: GhlSubAccountId }>();
  for (const ev of events) {
    result.byGoogleEventId[ev.id] = null;
    const key = eventCompositeKey(ev);
    if (!key) continue;
    let winner: { contactId: string; sub: GhlSubAccountId } | null = null;
    for (const { sub, keyToContact } of indexesBySub) {
      const cid = keyToContact.get(key);
      if (!cid) continue;
      if (!winner) {
        winner = { contactId: cid, sub };
      } else if (winner.sub !== sub || winner.contactId !== cid) {
        console.warn(
          `[ghl-xref] composite-key collision for event=${ev.id}: matched both sub=${winner.sub}/contact=${winner.contactId} and sub=${sub}/contact=${cid}; keeping first`
        );
      }
    }
    if (winner) needed.set(ev.id, winner);
  }

  // Fan out unique contact lookups in parallel, scoped to each contact's
  // owning sub-account.
  type LookupKey = `${GhlSubAccountId}:${string}`;
  const uniqueLookups = new Map<LookupKey, { contactId: string; sub: GhlSubAccountId }>();
  for (const [, w] of needed) {
    uniqueLookups.set(`${w.sub}:${w.contactId}`, w);
  }
  const contactEntries = await Promise.all(
    Array.from(uniqueLookups.values()).map(async ({ contactId, sub }) => {
      const c = await getContactById(contactId, sub).catch(() => null);
      return [`${sub}:${contactId}` as LookupKey, c] as const;
    })
  );
  const contactsByKey = new Map(contactEntries);

  for (const [eventId, w] of needed) {
    const c = contactsByKey.get(`${w.sub}:${w.contactId}`) ?? null;
    result.byGoogleEventId[eventId] = toRef(c, w.sub);
  }

  return result;
}
