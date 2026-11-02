"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addWeeks, endOfWeek, format, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, UserRound } from "lucide-react";
import { GoogleConnectCard } from "@/components/closer/GoogleConnectCard";
import type { CalendarEvent } from "@/components/closer/CalendarEventList";
import { SetterCalendarEventList } from "@/components/closer/SetterCalendarEventList";
import { SetterAppointmentEditor } from "@/components/closer/SetterAppointmentEditor";
import { MobileFiltersSheet } from "@/components/closer/MobileFiltersSheet";
import { useElementHeightVar } from "@/hooks/useElementHeightVar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { AppointmentRecord } from "@/lib/appointments";

interface AppointmentsResponse {
  appointments: AppointmentRecord[];
  byEvent: Record<string, AppointmentRecord>;
}

export default function SetterAppointmentsPage() {
  const queryClient = useQueryClient();
  const [weekOffset, setWeekOffset] = useState(0);
  const [calendarFilter, setCalendarFilter] = useState("all");
  const [editing, setEditing] = useState<{ event: CalendarEvent; appt: AppointmentRecord } | null>(null);

  // Mirror the sticky nav's height into --calendar-nav-h (like the closer
  // and admin calendars) so the sticky day headers pin flush below it.
  const navRef = useRef<HTMLDivElement>(null);
  useElementHeightVar(navRef, "--calendar-nav-h");

  const weekStart = useMemo(() => {
    const base = startOfWeek(new Date(), { weekStartsOn: 1 });
    return weekOffset === 0 ? base : addWeeks(base, weekOffset);
  }, [weekOffset]);

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

  const { data: status } = useQuery<{ connected: boolean; email?: string }>({
    queryKey: ["google-calendar-status"],
    queryFn: async () => {
      const res = await fetch("/api/auth/google/status");
      const json = await res.json();
      return json.data;
    },
    staleTime: 60_000,
  });

  const { data: events = [], isLoading: eventsLoading } = useQuery<CalendarEvent[]>({
    queryKey: ["calendar-events", weekStart.toISOString()],
    queryFn: async () => {
      const res = await fetch(
        `/api/calendar/events?timeMin=${weekStart.toISOString()}&timeMax=${weekEnd.toISOString()}`
      );
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: status?.connected === true,
    staleTime: 30_000,
  });

  const { data: appointments } = useQuery<AppointmentsResponse>({
    queryKey: ["setter-appointments"],
    queryFn: async () => {
      const res = await fetch("/api/closer/setter/appointments");
      const json = await res.json();
      return json.data;
    },
    staleTime: 30_000,
  });

  // Team-wide attendance (read-only for setters — closers write to it).
  // POST the visible week's events (like the closer calendar) so the server
  // narrows attendance + GHL-link work to those events instead of the legacy
  // GET path that enumerates every link row and all-time attendance.
  const { data: attendance = {} } = useQuery<Record<string, string>>({
    queryKey: ["team-attendance", weekStart.toISOString()],
    queryFn: async () => {
      const res = await fetch("/api/calendar/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events: events.map((e) => ({
            id: e.id,
            title: e.title,
            start: e.start,
            end: e.end,
          })),
        }),
      });
      if (!res.ok) return {};
      const json = await res.json();
      return json.data ?? {};
    },
    enabled: events.length > 0,
    staleTime: 30_000,
  });

  const apptByEvent = appointments?.byEvent ?? {};

  async function handleClaim(event: CalendarEvent) {
    const res = await fetch("/api/closer/setter/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        googleEventId: event.id,
        clientName: event.title,
        clientEmail: event.attendees[0]?.email ?? null,
        scheduledAt: event.start,
      }),
    });
    if (res.ok) {
      await queryClient.invalidateQueries({ queryKey: ["setter-appointments"] });
    }
  }

  async function handleUnclaim(event: CalendarEvent) {
    const res = await fetch(
      `/api/closer/setter/appointments?eventId=${encodeURIComponent(event.id)}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      await queryClient.invalidateQueries({ queryKey: ["setter-appointments"] });
    }
  }

  function handleEdit(event: CalendarEvent, appt: AppointmentRecord) {
    setEditing({ event, appt });
  }

  const calendarOwners = useMemo(() => {
    const names = new Set<string>();
    for (const e of events) {
      if (e.calendarName) names.add(e.calendarName);
    }
    return [...names].sort();
  }, [events]);

  const activeFilter =
    calendarFilter !== "all" && !calendarOwners.includes(calendarFilter) ? "all" : calendarFilter;

  const filteredEvents = useMemo(() => {
    if (activeFilter === "all") return events;
    return events.filter((e) => e.calendarName === activeFilter);
  }, [events, activeFilter]);

  const connected = status?.connected ?? false;

  return (
    <main className="flex-1 overflow-y-auto overflow-x-hidden">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Appointments</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Claim calendar events you&apos;re setting for and track pre/post-call status.
          </p>
        </div>

        <div className="mb-6">
          <GoogleConnectCard connected={connected} email={status?.email} isAdmin={false} />
        </div>

        {connected && (
          <>
            {/* Sticky week navigator + filter — same pattern as the closer
                and admin calendar pages so prev/next stays reachable from
                any scroll position. */}
            <div
              ref={navRef}
              className="sticky top-0 z-20 -mx-4 md:-mx-6 px-4 md:px-6 pt-2 pb-3 mb-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b"
            >
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setWeekOffset((w) => w - 1)}
                  aria-label="Previous week"
                >
                  <ChevronLeft />
                </Button>
                <div className="flex flex-col items-center text-center">
                  <p className="text-sm font-semibold tracking-tight text-foreground">
                    {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
                  </p>
                  {weekOffset !== 0 && (
                    <Button
                      variant="link"
                      size="xs"
                      onClick={() => setWeekOffset(0)}
                      className="h-auto px-0 mt-0.5 text-muted-foreground hover:text-foreground"
                    >
                      Back to this week
                    </Button>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setWeekOffset((w) => w + 1)}
                  aria-label="Next week"
                >
                  <ChevronRight />
                </Button>
              </div>

              {calendarOwners.length > 1 && (
                <>
                  {/* Desktop filter row; on mobile the same choices sit in
                      the Filters dialog so long labels don't wrap the nav. */}
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    value={activeFilter}
                    // Radix reports "" when the active pill is clicked again;
                    // that pill is `activeFilter`, so this sets exactly what
                    // its old onClick did (incl. clearing a stale owner on "All").
                    onValueChange={(v) => setCalendarFilter(v || activeFilter)}
                    aria-label="Filter by calendar"
                    className="hidden sm:flex flex-wrap justify-start mt-3"
                  >
                    <ToggleGroupItem value="all" className="px-3 text-xs">
                      All ({events.length})
                    </ToggleGroupItem>
                    {calendarOwners.map((owner) => {
                      const count = events.filter((e) => e.calendarName === owner).length;
                      return (
                        <ToggleGroupItem key={owner} value={owner} className="px-3 text-xs">
                          <UserRound className="size-3" />
                          {owner} ({count})
                        </ToggleGroupItem>
                      );
                    })}
                  </ToggleGroup>

                  <MobileFiltersSheet activeCount={activeFilter !== "all" ? 1 : 0}>
                    <div>
                      <p className="text-sm font-medium text-foreground mb-2">
                        Calendar
                      </p>
                      <ToggleGroup
                        type="single"
                        variant="outline"
                        size="sm"
                        value={activeFilter}
                        onValueChange={(v) => setCalendarFilter(v || activeFilter)}
                        aria-label="Filter by calendar"
                        className="flex-wrap justify-start"
                      >
                        <ToggleGroupItem value="all" className="px-3 text-xs">
                          All ({events.length})
                        </ToggleGroupItem>
                        {calendarOwners.map((owner) => {
                          const count = events.filter((e) => e.calendarName === owner).length;
                          return (
                            <ToggleGroupItem key={owner} value={owner} className="px-3 text-xs">
                              <UserRound className="size-3" />
                              {owner} ({count})
                            </ToggleGroupItem>
                          );
                        })}
                      </ToggleGroup>
                    </div>
                  </MobileFiltersSheet>
                </>
              )}
            </div>

            {eventsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            ) : (
              <SetterCalendarEventList
                events={filteredEvents}
                appointmentsByEvent={apptByEvent}
                attendance={attendance}
                onClaim={handleClaim}
                onUnclaim={handleUnclaim}
                onEdit={handleEdit}
              />
            )}
          </>
        )}

        {editing && (
          <SetterAppointmentEditor
            event={editing.event}
            appointment={editing.appt}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              queryClient.invalidateQueries({ queryKey: ["setter-appointments"] });
            }}
          />
        )}
      </div>
    </main>
  );
}
