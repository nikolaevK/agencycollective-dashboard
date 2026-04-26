import { google } from "googleapis";
import { getOAuthClient } from "./oauth";
import { getCalendarConfig } from "./tokenStorage";
import cache, { CacheKeys, TTL } from "../cache";

export type AttendeeResponseStatus =
  | "needsAction"
  | "declined"
  | "tentative"
  | "accepted";

export interface CalendarAttendee {
  email: string;
  displayName: string | null;
  responseStatus: AttendeeResponseStatus | null;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start: string; // ISO 8601
  end: string; // ISO 8601
  attendees: CalendarAttendee[];
  meetLink: string | null;
  status: string;
  allDay: boolean;
  calendarName: string;
}

/**
 * Google Calendar descriptions arrive as HTML (paragraph tags, line-break
 * tags, entities, sometimes inline styles) — most loudly from iClosed-style
 * integrations that paste a full email body. Consumers render the field as
 * plain text, so collapse markup to readable text at the source rather than
 * making every surface re-strip.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    // &amp; decoded last so a literal `&amp;lt;` stays as `&lt;` instead of
    // collapsing to `<`. Other entities are decoded first while the `&` is
    // still in escaped form.
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeEvent(event: any, calendarName: string): CalendarEvent {
  const rawAttendees: Array<{
    email?: string;
    displayName?: string;
    responseStatus?: string;
  }> = Array.isArray(event.attendees) ? event.attendees : [];

  return {
    id: event.id ?? "",
    title: event.summary ?? "(No title)",
    description: event.description ? stripHtml(String(event.description)) : null,
    location: event.location ?? null,
    start: event.start?.dateTime ?? event.start?.date ?? "",
    end: event.end?.dateTime ?? event.end?.date ?? "",
    attendees: rawAttendees
      .filter((a) => Boolean(a.email))
      .map((a) => ({
        email: String(a.email),
        displayName: a.displayName ? String(a.displayName) : null,
        responseStatus:
          a.responseStatus === "accepted" ||
          a.responseStatus === "declined" ||
          a.responseStatus === "tentative" ||
          a.responseStatus === "needsAction"
            ? (a.responseStatus as AttendeeResponseStatus)
            : null,
      })),
    meetLink: event.hangoutLink ?? null,
    status: event.status ?? "confirmed",
    allDay: !event.start?.dateTime,
    calendarName,
  };
}

export async function getCalendarEvents(
  timeMin: string,
  timeMax: string
): Promise<CalendarEvent[]> {
  const config = await getCalendarConfig();
  if (!config) return [];

  // Cache by (scope, timeMin, timeMax) so concurrent dashboard loads and the
  // 120s refetch interval don't thrash Google's API. Scope prevents dev/prod
  // tokens from serving each other's events. 2-minute TTL is short enough
  // that a freshly-marked no-show shows up within two refetches.
  const scope = process.env.NODE_ENV === "production" ? "production" : "development";
  const cacheKey = CacheKeys.googleEvents(timeMin, timeMax, scope);
  const cached = cache.get<CalendarEvent[]>(cacheKey);
  if (cached) return cached;

  const auth = getOAuthClient();
  auth.setCredentials({
    access_token: config.accessToken,
    refresh_token: config.refreshToken,
  });

  const calendar = google.calendar({ version: "v3", auth });

  try {
    // Fetch only from calendars the user has subscribed to
    const calListRes = await calendar.calendarList.list();
    const calendars = calListRes.data.items ?? [];

    const allEvents: CalendarEvent[] = [];

    const fetches = calendars.map(async (cal) => {
      if (!cal.id) return;
      try {
        let pageToken: string | undefined;
        do {
          const response = await calendar.events.list({
            calendarId: cal.id,
            timeMin,
            timeMax,
            maxResults: 250,
            singleEvents: true,
            orderBy: "startTime",
            pageToken,
          });

          const events = response.data.items ?? [];
          const calName = cal.summary ?? cal.id;
          for (const event of events) {
            allEvents.push(normalizeEvent(event, calName));
          }
          pageToken = response.data.nextPageToken ?? undefined;
        } while (pageToken);
      } catch (err) {
        console.warn(`[google-calendar] Skipping calendar ${cal.id}:`, err);
      }
    });

    await Promise.all(fetches);

    // Deduplicate events that appear in multiple calendars
    const seen = new Map<string, CalendarEvent>();
    for (const event of allEvents) {
      if (!seen.has(event.id)) {
        seen.set(event.id, event);
      }
    }

    // Sort by start time
    const unique = Array.from(seen.values());
    unique.sort((a, b) => {
      const aTime = new Date(a.start).getTime();
      const bTime = new Date(b.start).getTime();
      return aTime - bTime;
    });

    cache.set(cacheKey, unique, TTL.GOOGLE_EVENTS);
    return unique;
  } catch (err) {
    console.error("[google-calendar] Failed to fetch events:", err);
    return [];
  }
}
