import { google } from "googleapis";
import { getOAuthClient } from "./oauth";
import { getCalendarConfig } from "./tokenStorage";

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  start: string; // ISO 8601
  end: string; // ISO 8601
  attendees: string[];
  meetLink: string | null;
  status: string;
  allDay: boolean;
  calendarName: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeEvent(event: any, calendarName: string): CalendarEvent {
  return {
    id: event.id ?? "",
    title: event.summary ?? "(No title)",
    description: event.description ?? null,
    start: event.start?.dateTime ?? event.start?.date ?? "",
    end: event.end?.dateTime ?? event.end?.date ?? "",
    attendees: (event.attendees ?? [])
      .map((a: { email?: string; displayName?: string }) => a.email ?? a.displayName ?? "")
      .filter(Boolean),
    meetLink: event.hangoutLink ?? null,
    status: event.status ?? "confirmed",
    allDay: !event.start?.dateTime,
    calendarName,
  };
}

export async function getCalendarEvents(
  timeMin: string,
  timeMax: string,
  additionalCalendarIds?: string[]
): Promise<CalendarEvent[]> {
  const config = await getCalendarConfig();
  if (!config) return [];

  const auth = getOAuthClient();
  auth.setCredentials({
    access_token: config.accessToken,
    refresh_token: config.refreshToken,
  });

  const calendar = google.calendar({ version: "v3", auth });

  try {
    // List all calendars the user has subscribed to
    const calListRes = await calendar.calendarList.list({ showHidden: true });
    const calendars = calListRes.data.items ?? [];

    // Collect calendar IDs already in the list to avoid duplicate fetches
    const knownCalIds = new Set(calendars.map((c) => c.id).filter(Boolean));

    // Merge in additional calendar IDs (e.g. closer emails from the database)
    // that the authenticated account can access via Workspace sharing
    const extraCalIds = (additionalCalendarIds ?? []).filter((id) => !knownCalIds.has(id));

    // Fetch events from all calendars in parallel
    const allEvents: CalendarEvent[] = [];

    async function fetchFromCalendar(calId: string, calName: string) {
      try {
        // Paginate to get ALL events (default maxResults is 250 but can be capped)
        let pageToken: string | undefined;
        do {
          const response = await calendar.events.list({
            calendarId: calId,
            timeMin,
            timeMax,
            maxResults: 250,
            singleEvents: true,
            orderBy: "startTime",
            pageToken,
          });

          const events = response.data.items ?? [];
          for (const event of events) {
            allEvents.push(normalizeEvent(event, calName));
          }
          pageToken = response.data.nextPageToken ?? undefined;
        } while (pageToken);
      } catch (err) {
        console.warn(`[google-calendar] Skipping calendar ${calId}:`, err);
      }
    }

    const fetches = [
      ...calendars.map((cal) =>
        cal.id ? fetchFromCalendar(cal.id, cal.summary ?? cal.id) : Promise.resolve()
      ),
      ...extraCalIds.map((id) => fetchFromCalendar(id, id.split("@")[0])),
    ];

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

    return unique;
  } catch (err) {
    console.error("[google-calendar] Failed to fetch events:", err);
    return [];
  }
}
