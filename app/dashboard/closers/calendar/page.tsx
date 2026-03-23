"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks } from "date-fns";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { CloserSubNav } from "@/components/closers/CloserSubNav";
import { GoogleConnectCard } from "@/components/closer/GoogleConnectCard";
import { CalendarEventList, type CalendarEvent } from "@/components/closer/CalendarEventList";

export default function AdminCalendarPage() {
  const [weekOffset, setWeekOffset] = useState(0);

  const currentWeekStart = useMemo(() => {
    const base = startOfWeek(new Date(), { weekStartsOn: 1 });
    return weekOffset === 0 ? base : addWeeks(base, weekOffset);
  }, [weekOffset]);

  const currentWeekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });

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
    queryKey: ["calendar-events", currentWeekStart.toISOString()],
    queryFn: async () => {
      const res = await fetch(
        `/api/calendar/events?timeMin=${currentWeekStart.toISOString()}&timeMax=${currentWeekEnd.toISOString()}`
      );
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: status?.connected === true,
    staleTime: 30_000,
  });

  const connected = status?.connected ?? false;

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl lg:text-3xl font-black text-foreground">
            Team Calendar
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            View and manage team appointments from Google Calendar
          </p>
        </div>

        <CloserSubNav />

        {/* Connection status */}
        <GoogleConnectCard
          connected={connected}
          email={status?.email}
          isAdmin={true}
        />

        {connected && (
          <>
            {/* Week navigator */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setWeekOffset((w) => w - 1)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">
                  {format(currentWeekStart, "MMM d")} – {format(currentWeekEnd, "MMM d, yyyy")}
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
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Events */}
            {eventsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 rounded-xl bg-muted/50 animate-pulse" />
                ))}
              </div>
            ) : (
              <CalendarEventList events={events} />
            )}
          </>
        )}
      </div>
    </DashboardShell>
  );
}
