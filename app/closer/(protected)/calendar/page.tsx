"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks } from "date-fns";
import { GoogleConnectCard } from "@/components/closer/GoogleConnectCard";
import { CalendarEventList, type CalendarEvent } from "@/components/closer/CalendarEventList";
import { LinkEventDealModal } from "@/components/closer/LinkEventDealModal";

export default function CloserCalendarPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [linkingEvent, setLinkingEvent] = useState<CalendarEvent | null>(null);
  const queryClient = useQueryClient();

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

  // Get linked event IDs from closer's deals
  const { data: deals = [] } = useQuery<Array<{ googleEventId: string | null }>>({
    queryKey: ["closer-deals"],
    queryFn: async () => {
      const res = await fetch("/api/closer/deals");
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 30_000,
  });

  const linkedEventIds = useMemo(() => {
    const ids = new Set<string>();
    for (const deal of deals) {
      if (deal.googleEventId) ids.add(deal.googleEventId);
    }
    return ids;
  }, [deals]);

  const connected = status?.connected ?? false;

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Calendar</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View appointments and link them to deals
          </p>
        </div>

        {/* Connection status */}
        <div className="mb-6">
          <GoogleConnectCard
            connected={connected}
            email={status?.email}
            isAdmin={false}
          />
        </div>

        {connected && (
          <>
            {/* Week navigator */}
            <div className="flex items-center justify-between mb-6">
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
              <CalendarEventList
                events={events}
                linkedEventIds={linkedEventIds}
                onLinkDeal={(event) => setLinkingEvent(event)}
              />
            )}
          </>
        )}

        {/* Link deal modal */}
        {linkingEvent && (
          <LinkEventDealModal
            event={linkingEvent}
            onClose={() => {
              setLinkingEvent(null);
              queryClient.invalidateQueries({ queryKey: ["closer-deals"] });
            }}
          />
        )}
      </div>
    </main>
  );
}
