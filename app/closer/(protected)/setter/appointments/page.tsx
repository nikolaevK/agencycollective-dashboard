"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addWeeks, endOfWeek, format, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { GoogleConnectCard } from "@/components/closer/GoogleConnectCard";
import type { CalendarEvent } from "@/components/closer/CalendarEventList";
import { SetterCalendarEventList } from "@/components/closer/SetterCalendarEventList";
import { SetterAppointmentEditor } from "@/components/closer/SetterAppointmentEditor";
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
  const { data: attendance = {} } = useQuery<Record<string, string>>({
    queryKey: ["team-attendance"],
    queryFn: async () => {
      const res = await fetch("/api/calendar/attendance");
      if (!res.ok) return {};
      const json = await res.json();
      return json.data ?? {};
    },
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
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Appointments</h1>
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
            <div className="sticky top-0 z-20 -mx-4 md:-mx-6 px-4 md:px-6 pt-2 pb-3 mb-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border/40">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setWeekOffset((w) => w - 1)}
                  aria-label="Previous week"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="text-center">
                  <p className="text-sm font-semibold text-foreground">
                    {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
                  </p>
                  {weekOffset !== 0 && (
                    <button
                      onClick={() => setWeekOffset(0)}
                      className="text-xs text-primary hover:underline mt-0.5"
                    >
                      Back to this week
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setWeekOffset((w) => w + 1)}
                  aria-label="Next week"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {calendarOwners.length > 1 && (
                <div className="flex items-center gap-2 flex-wrap mt-3">
                  <button
                    onClick={() => setCalendarFilter("all")}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                      activeFilter === "all"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    All ({events.length})
                  </button>
                  {calendarOwners.map((owner) => {
                    const count = events.filter((e) => e.calendarName === owner).length;
                    return (
                      <button
                        key={owner}
                        onClick={() => setCalendarFilter(owner)}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                          activeFilter === owner
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/50 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <UserRound className="h-3 w-3" />
                        {owner} ({count})
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {eventsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 rounded-xl bg-muted/50 animate-pulse" />
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
