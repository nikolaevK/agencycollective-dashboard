"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, startOfWeek, endOfWeek, addWeeks } from "date-fns";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { CloserSubNav } from "@/components/closers/CloserSubNav";
import { GoogleConnectCard } from "@/components/closer/GoogleConnectCard";
import { CalendarEventList, type CalendarEvent, type LinkedDealInfo } from "@/components/closer/CalendarEventList";
import type { DealPublic } from "@/components/closers/types";
import type { AppointmentIndexEntry } from "@/lib/appointments";

interface DealWithCloserName extends DealPublic {
  closerName?: string;
}

export default function AdminCalendarPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [closerFilter, setCloserFilter] = useState("all");

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

  // Fetch all deals to show linked indicators
  const { data: allDeals = [] } = useQuery<DealWithCloserName[]>({
    queryKey: ["admin-all-deals-calendar"],
    queryFn: async () => {
      const [dealsRes, closersRes] = await Promise.all([
        fetch("/api/admin/deals"),
        fetch("/api/admin/closers/stats"),
      ]);
      const dealsJson = await dealsRes.json();
      const closersJson = await closersRes.json();
      const deals: DealPublic[] = dealsJson.data ?? [];
      const breakdowns: Array<{ closerId: string; displayName: string }> = closersJson.data?.closerBreakdowns ?? [];
      const closerNameMap = new Map(breakdowns.map((b) => [b.closerId, b.displayName]));
      return deals.map((d) => ({ ...d, closerName: closerNameMap.get(d.closerId) }));
    },
    staleTime: 30_000,
  });

  // Fetch attendance data
  const { data: attendance = {} } = useQuery<Record<string, string>>({
    queryKey: ["admin-attendance"],
    queryFn: async () => {
      const res = await fetch("/api/admin/attendance");
      const json = await res.json();
      // Convert { eventId: { showStatus, closerId } } to { eventId: showStatus }
      const raw = json.data ?? {};
      const result: Record<string, string> = {};
      for (const [eventId, val] of Object.entries(raw)) {
        result[eventId] = (val as { showStatus: string }).showStatus;
      }
      return result;
    },
    staleTime: 30_000,
  });

  // Setter claims per event (shared endpoint used by admin + closer surfaces)
  const { data: setterAppointments = {} } = useQuery<Record<string, AppointmentIndexEntry>>({
    queryKey: ["calendar-appointments"],
    queryFn: async () => {
      const res = await fetch("/api/calendar/appointments");
      if (!res.ok) return {};
      const json = await res.json();
      return json.data ?? {};
    },
    staleTime: 30_000,
  });

  const linkedEventIds = useMemo(() => {
    const ids = new Set<string>();
    for (const deal of allDeals) {
      if (deal.googleEventId) ids.add(deal.googleEventId);
    }
    return ids;
  }, [allDeals]);

  const linkedDeals: LinkedDealInfo[] = useMemo(() => {
    return allDeals
      .filter((d) => d.googleEventId)
      .map((d) => ({
        dealId: d.id,
        googleEventId: d.googleEventId!,
        closerId: d.closerId,
        closerName: d.closerName,
      }));
  }, [allDeals]);

  // Extract unique calendar owners for filter dropdown
  const calendarOwners = useMemo(() => {
    const names = new Set<string>();
    for (const e of events) {
      if (e.calendarName) names.add(e.calendarName);
    }
    return [...names].sort();
  }, [events]);

  // Reset filter if selected closer has no events in the current week
  const activeFilter = closerFilter !== "all" && !calendarOwners.includes(closerFilter) ? "all" : closerFilter;

  // Filter events by selected closer/calendar
  const filteredEvents = useMemo(() => {
    if (activeFilter === "all") return events;
    return events.filter((e) => e.calendarName === activeFilter);
  }, [events, activeFilter]);

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

        <GoogleConnectCard
          connected={connected}
          email={status?.email}
          isAdmin={true}
        />

        {connected && (
          <>
            {/* Sticky week navigator + filter — keeps prev/next + filter
                chips reachable from any scroll position. */}
            <div className="sticky top-0 z-20 -mx-6 px-6 pt-2 pb-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border/40">
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
                  aria-label="Next week"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {calendarOwners.length > 1 && (
                <div className="flex items-center gap-2 flex-wrap mt-3">
                  <button
                    onClick={() => setCloserFilter("all")}
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
                        onClick={() => setCloserFilter(owner)}
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
              <CalendarEventList
                events={filteredEvents}
                linkedEventIds={linkedEventIds}
                linkedDeals={linkedDeals}
                attendance={attendance}
                appointments={setterAppointments}
                isAdmin={true}
              />
            )}
          </>
        )}
      </div>
    </DashboardShell>
  );
}
