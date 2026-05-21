export const dynamic = "force-dynamic";
// POST does discovery (composite-key matching against the cached GHL bulk
// listing) plus per-link drift detection. On a cold cache + rate-limit
// retries the worst case can run several seconds; 30s matches the other
// GHL-touching routes and keeps Vercel from killing the function.
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { getCloserSession } from "@/lib/closerSession";
import { getLatestAttendanceByEvent } from "@/lib/eventAttendance";
import {
  listAllLinks,
  listLinksByGoogleEventIds,
  updateLinkSyncState,
  upsertLink,
  type SyncState,
} from "@/lib/ghlAppointmentLinks";
import { getAppointmentsByContact } from "@/lib/ghl/calendars";
import { eventCompositeKey } from "@/lib/ghl/crossReference";
import {
  getConfiguredSubAccountIds,
  isAnyGhlConfigured,
  type GhlSubAccountId,
} from "@/lib/ghl/subAccounts";
import type { GhlContactAppointment } from "@/types/ghl";

interface SyncEntry {
  dashboardStatus: "showed" | "no_show" | null;
  ghlStatus: string | null;
  syncState: SyncState;
  /** Which sub-account this link points to — null if no link (non-GHL). */
  subAccountId: GhlSubAccountId | null;
}

interface DiscoveryEvent {
  id?: string;
  title?: string | null;
  start?: string | null;
  end?: string | null;
}

interface ResponseShape {
  data: Record<string, string>;
  sync: Record<string, SyncEntry>;
}

function mapGhlToDashboard(s: string | null): "showed" | "no_show" | null {
  if (s === "showed") return "showed";
  if (s === "noshow") return "no_show";
  return null;
}

async function buildResponse(
  visibleEvents: DiscoveryEvent[] | null
): Promise<ResponseShape> {
  const data = await getLatestAttendanceByEvent();
  const sync: Record<string, SyncEntry> = {};

  if (!isAnyGhlConfigured()) {
    return { data, sync };
  }

  // Narrow the link query to just the events the caller is rendering when
  // we have that list. Falls back to listing every link row for the legacy
  // GET path (setter dashboard) where coords aren't sent.
  const visibleIds = visibleEvents
    ? visibleEvents.map((e) => e.id).filter((id): id is string => typeof id === "string" && id.length > 0)
    : null;

  const configuredSubs = getConfiguredSubAccountIds();
  const [existingLinks, ...apptResults] = await Promise.all([
    visibleIds
      ? listLinksByGoogleEventIds(visibleIds).then((m) => Object.values(m))
      : listAllLinks(),
    ...configuredSubs.map(async (sub) => {
      try {
        return { sub, map: await getAppointmentsByContact(sub) } as const;
      } catch {
        return { sub, map: null as Map<string, GhlContactAppointment[]> | null } as const;
      }
    }),
  ]);

  // Build a per-sub-account index of (compositeKey → matched appointment)
  // and a (subAccountId, ghlAppointmentId) → status lookup for drift
  // detection. The link row carries the authoritative sub-account id, so
  // status lookups have to be sub-scoped (an appointment id is only valid
  // within its own location).
  const ghlStatusByLinkKey = new Map<string, string | null>();
  const ghlByCompositeKeyAndSub = new Map<
    string,
    { sub: GhlSubAccountId; appt: GhlContactAppointment }
  >();
  for (const r of apptResults) {
    if (!r.map) continue;
    const { sub, map } = r;
    for (const [, appts] of map as Map<string, GhlContactAppointment[]>) {
      for (const appt of appts) {
        if (appt.id) {
          ghlStatusByLinkKey.set(
            `${sub}:${appt.id}`,
            appt.appointmentStatus ?? null
          );
        }
        const key = eventCompositeKey({
          title: appt.title,
          startTime: appt.startTime,
          endTime: appt.endTime,
        });
        // First-seen wins on composite-key collisions across sub-accounts,
        // matching the lib/ghl/crossReference.ts convention (priority =
        // SUB_ACCOUNTS order).
        if (key && appt.id && !ghlByCompositeKeyAndSub.has(key)) {
          ghlByCompositeKeyAndSub.set(key, { sub, appt });
        }
      }
    }
  }

  const linksByGoogle = new Map(existingLinks.map((l) => [l.googleEventId, l]));
  // Did at least one sub-account return data? If none did (rate limit,
  // outage, etc.), we still want to surface existing link rows from the DB
  // but skip drift detection (would falsely flip every chip to out-of-sync).
  const anyGhlDataLoaded = apptResults.some((r) => r.map !== null);

  // Discovery pass: when the caller passed event coords AND we have GHL
  // data, create link rows for any composite-key matches that don't yet
  // have one. Without this the sync chip wouldn't appear until first
  // interaction. Parallelize because the inserts are independent.
  if (visibleEvents && anyGhlDataLoaded) {
    const toCreate: Array<{
      eventId: string;
      ghlId: string;
      contactId: string | null;
      calendarId: string | null;
      sub: GhlSubAccountId;
    }> = [];
    for (const evt of visibleEvents) {
      if (!evt.id || linksByGoogle.has(evt.id)) continue;
      const key = eventCompositeKey({
        title: evt.title ?? null,
        startTime: evt.start ?? null,
        endTime: evt.end ?? null,
      });
      if (!key) continue;
      const match = ghlByCompositeKeyAndSub.get(key);
      if (!match?.appt.id) continue;
      toCreate.push({
        eventId: evt.id,
        ghlId: match.appt.id,
        contactId: match.appt.contactId ?? null,
        calendarId: match.appt.calendarId ?? null,
        sub: match.sub,
      });
    }
    if (toCreate.length > 0) {
      const created = await Promise.all(
        toCreate.map((c) =>
          upsertLink({
            googleEventId: c.eventId,
            ghlAppointmentId: c.ghlId,
            ghlContactId: c.contactId,
            ghlCalendarId: c.calendarId,
            subAccountId: c.sub,
          }).catch((err) => {
            console.error(
              "[calendar/attendance] discovery upsert failed for",
              c.eventId,
              `(sub=${c.sub})`,
              err instanceof Error ? err.message : err
            );
            return null;
          })
        )
      );
      for (const link of created) {
        if (link) linksByGoogle.set(link.googleEventId, link);
      }
    }
  }

  // Build sync entries for every link we know about (existing + just-created).
  // Collect drift-persistence writes and await them as a batch before
  // returning — fire-and-forget gets cut off in serverless runtimes.
  const driftWrites: Promise<unknown>[] = [];
  for (const [, link] of linksByGoogle) {
    const freshGhl = anyGhlDataLoaded
      ? ghlStatusByLinkKey.get(`${link.subAccountId}:${link.ghlAppointmentId}`) ?? null
      : link.ghlStatus;

    const dashboardStatus = (data[link.googleEventId] as "showed" | "no_show" | undefined) ?? null;
    const ghlAttendance = mapGhlToDashboard(freshGhl);
    const driftDetected =
      link.ghlStatus !== freshGhl ||
      (ghlAttendance !== dashboardStatus && link.syncState === "synced");

    const computedState: SyncState = driftDetected
      ? ghlAttendance === dashboardStatus
        ? "synced"
        : "out_of_sync"
      : link.syncState;

    sync[link.googleEventId] = {
      dashboardStatus,
      ghlStatus: freshGhl,
      syncState: computedState,
      subAccountId: link.subAccountId,
    };

    if (anyGhlDataLoaded && (link.ghlStatus !== freshGhl || link.syncState !== computedState)) {
      driftWrites.push(
        updateLinkSyncState({
          googleEventId: link.googleEventId,
          syncState: computedState,
          ghlStatus: freshGhl,
          bumpLastPull: true,
        }).catch((err) => {
          console.error("[calendar/attendance] failed to persist drift:", err);
        })
      );
    }
  }
  if (driftWrites.length > 0) await Promise.all(driftWrites);

  return { data, sync };
}

function authorize(): boolean {
  return getAdminSession() !== null || getCloserSession() !== null;
}

/**
 * Team-wide attendance index keyed by googleEventId. Admins, closers, and
 * setters all read from here so the calendar surfaces share one source of
 * truth for show/no-show pills.
 *
 * GET: returns existing dashboard attendance + sync state only for events
 *      that already have a GHL link row.
 * POST: same response shape, but takes `{ events: [{id,title,start,end}] }`
 *      and runs a discovery pass first — creates link rows for any visible
 *      events whose (title,start,end) matches a GHL appointment in any
 *      configured sub-account. Used by the calendar pages so the sync chip
 *      appears on the first load.
 */
export async function GET() {
  if (!authorize()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await buildResponse(null);
  return NextResponse.json(body);
}

export async function POST(request: Request) {
  if (!authorize()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let parsed: { events?: DiscoveryEvent[] };
  try {
    parsed = (await request.json()) as { events?: DiscoveryEvent[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const events = Array.isArray(parsed.events) ? parsed.events : [];
  const body = await buildResponse(events);
  return NextResponse.json(body);
}
