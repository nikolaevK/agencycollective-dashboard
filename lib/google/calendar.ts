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
  timeMax: string
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

    return unique;
  } catch (err) {
    console.error("[google-calendar] Failed to fetch events:", err);
    return [];
  }
}
