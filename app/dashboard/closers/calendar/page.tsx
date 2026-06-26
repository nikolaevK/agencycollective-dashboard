"use client";

import { useState, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, startOfWeek, endOfWeek, addWeeks } from "date-fns";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { CloserSubNav } from "@/components/closers/CloserSubNav";
import { GoogleConnectCard } from "@/components/closer/GoogleConnectCard";
import { CalendarEventList, type CalendarEvent, type GhlSyncEntry, type LinkedDealInfo } from "@/components/closer/CalendarEventList";
import {
  SubAccountFilterPills,
  type SubAccountFilterValue,
} from "@/components/ghl/SubAccountFilterPills";
import { SUB_ACCOUNTS } from "@/lib/ghl/subAccounts";
import { useElementHeightVar } from "@/hooks/useElementHeightVar";
import { MobileFiltersSheet } from "@/components/closer/MobileFiltersSheet";
import { ScrollToTopButton } from "@/components/closer/ScrollToTopButton";
import type { DealPublic } from "@/components/closers/types";
import type { AppointmentIndexEntry } from "@/lib/appointments";

interface DealWithCloserName extends DealPublic {
  closerName?: string;
}

export default function AdminCalendarPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [closerFilter, setCloserFilter] = useState("all");
  const [subFilter, setSubFilter] = useState<SubAccountFilterValue>("all");
  const queryClient = useQueryClient();

  // Sticky nav height is mirrored into --calendar-nav-h on <html> so the
  // sticky day headers below stick flush with the bottom of this nav,
  // regardless of how many filter rows are visible.
  const navRef = useRef<HTMLDivElement>(null);
  useElementHeightVar(navRef, "--calendar-nav-h");

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

  // Fetch attendance data — admin keeps its closer-attribution endpoint for
  // the team breakdown, but the GHL sync chip uses the shared team-wide
  // endpoint (POST with event coords so links auto-discover on load).
  // We split the response into two derived maps: { eventId: showStatus }
  // for the badge, and { eventId: closerId } for the reassign-picker.
  const { data: attendanceMaps = { status: {} as Record<string, string>, closerId: {} as Record<string, string> } } = useQuery<{
    status: Record<string, string>;
    closerId: Record<string, string>;
  }>({
    queryKey: ["admin-attendance"],
    queryFn: async () => {
      const res = await fetch("/api/admin/attendance");
      const json = await res.json();
      const raw = (json.data ?? {}) as Record<string, { showStatus: string; closerId: string }>;
      const status: Record<string, string> = {};
      const closerId: Record<string, string> = {};
      for (const [eventId, val] of Object.entries(raw)) {
        status[eventId] = val.showStatus;
        closerId[eventId] = val.closerId;
      }
      return { status, closerId };
    },
    staleTime: 30_000,
  });
  const attendance = attendanceMaps.status;
  const attendanceCloserId = attendanceMaps.closerId;

  // Active closers + setters as reassignment targets for the per-card picker.
  // Cached 5 min — the list rarely changes mid-session, and the admin
  // calendar already does plenty of work per render.
  const { data: closersList = [] } = useQuery<Array<{ id: string; displayName: string }>>({
    queryKey: ["admin-closers-list-active"],
    queryFn: async () => {
      const res = await fetch("/api/admin/closers?status=active");
      if (!res.ok) return [];
      const json = await res.json();
      const rows = (json.data ?? []) as Array<{ id: string; displayName: string }>;
      return rows
        .map((c) => ({ id: c.id, displayName: c.displayName }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
    },
    staleTime: 5 * 60_000,
  });

  async function handleReassignAttribution(eventId: string, toCloserId: string) {
    const fromCloserId = attendanceCloserId[eventId];
    if (!fromCloserId || fromCloserId === toCloserId) return;
    const res = await fetch("/api/admin/attendance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, fromCloserId, toCloserId }),
    });
    if (!res.ok) {
      console.error("[admin-calendar] reassign failed:", await res.text());
      return;
    }
    // Refresh attendance + downstream stats (closer dashboard show rates,
    // team breakdowns) so the new attribution propagates without a reload.
    queryClient.invalidateQueries({ queryKey: ["admin-attendance"] });
    queryClient.invalidateQueries({ queryKey: ["admin-team-attendance-sync"] });
    queryClient.invalidateQueries({ queryKey: ["closers-stats"] });
  }

  const visibleEventIds = useMemo(() => events.map((e) => e.id).sort().join(","), [events]);
  const { data: ghlSync = {} } = useQuery<Record<string, GhlSyncEntry>>({
    queryKey: ["admin-team-attendance-sync", visibleEventIds],
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
      return json.sync ?? {};
    },
    enabled: events.length > 0,
    staleTime: 30_000,
    refetchInterval: 120_000,
  });

  async function handleResync(eventId: string, direction: "push" | "pull") {
    const evt = events.find((e) => e.id === eventId);
    const res = await fetch("/api/closer/attendance/resync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId,
        direction,
        eventTitle: evt?.title ?? null,
        eventStart: evt?.start ?? null,
        eventEnd: evt?.end ?? null,
        // Tell the server this is admin-driven so it doesn't fall back
        // to the requester's closer cookie for attribution. Without this
        // an admin who's also signed in as a closer silently re-attributed
        // every pulled event to their own closer row.
        asAdmin: true,
      }),
    });
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: ["admin-attendance"] });
      queryClient.invalidateQueries({ queryKey: ["admin-team-attendance-sync"] });
    }
  }

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

  // Step 1: filter by closer/calendar. Sub-account counts below are off this
  // pre-filtered set so the pill counts always reflect the user's current
  // view (switching closer filter changes what the sub-account counts say).
  const ownerFilteredEvents = useMemo(() => {
    if (activeFilter === "all") return events;
    return events.filter((e) => e.calendarName === activeFilter);
  }, [events, activeFilter]);

  // Step 2: compute per-sub-account + non-GHL counts. Missing ghlSync entry
  // = event has no GHL counterpart (manual Google entry / pre-sync holdover).
  const subFilterCounts = useMemo(() => {
    const bySub: Partial<Record<(typeof SUB_ACCOUNTS)[number]["id"], number>> = {};
    let nonGhl = 0;
    for (const e of ownerFilteredEvents) {
      const entry = ghlSync[e.id];
      if (!entry) {
        nonGhl += 1;
        continue;
      }
      const sub = entry.subAccountId;
      if (sub) bySub[sub] = (bySub[sub] ?? 0) + 1;
    }
    return { all: ownerFilteredEvents.length, bySub, nonGhl };
  }, [ownerFilteredEvents, ghlSync]);

  // Auto-reset subFilter when the chosen bucket has 0 events in the
  // current owner-filtered view. Without this, picking "Peptide" then
  // changing closer to one whose calls are all Agency would leave subFilter
  // stuck on "Peptide", the matching pill would hide (SubAccountFilterPills
  // suppresses zero-count buckets), and the user would have no way to
  // restore the view — they'd see only an empty event list.
  const activeSubFilter: SubAccountFilterValue = useMemo(() => {
    if (subFilter === "all") return "all";
    if (subFilter === "non-ghl") {
      return subFilterCounts.nonGhl > 0 ? "non-ghl" : "all";
    }
    return (subFilterCounts.bySub[subFilter] ?? 0) > 0 ? subFilter : "all";
  }, [subFilter, subFilterCounts]);

  // Step 3: apply the sub-account filter on top of the owner filter.
  const filteredEvents = useMemo(() => {
    if (activeSubFilter === "all") return ownerFilteredEvents;
    if (activeSubFilter === "non-ghl") return ownerFilteredEvents.filter((e) => !ghlSync[e.id]);
    return ownerFilteredEvents.filter((e) => ghlSync[e.id]?.subAccountId === activeSubFilter);
  }, [ownerFilteredEvents, activeSubFilter, ghlSync]);

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
            <div
              ref={navRef}
              className="sticky top-0 z-20 -mx-4 px-4 md:-mx-6 md:px-6 pt-2 pb-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border/40"
            >
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

              {/* Desktop filter rows — hidden on mobile where they'd wrap
                  to many lines and eat half the screen. */}
              {calendarOwners.length > 1 && (
                <div className="hidden sm:flex items-center gap-2 flex-wrap mt-3">
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

              <div className="hidden sm:block">
                <SubAccountFilterPills
                  value={activeSubFilter}
                  onChange={setSubFilter}
                  counts={subFilterCounts}
                />
              </div>

              {/* Mobile filter sheet */}
              <MobileFiltersSheet
                activeCount={
                  (activeFilter !== "all" ? 1 : 0) + (activeSubFilter !== "all" ? 1 : 0)
                }
              >
                {calendarOwners.length > 1 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Calendar
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
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
                  </div>
                )}
                <SubAccountFilterPills
                  value={activeSubFilter}
                  onChange={setSubFilter}
                  counts={subFilterCounts}
                />
              </MobileFiltersSheet>
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
                attendanceCloserId={attendanceCloserId}
                closers={closersList}
                ghlSync={ghlSync}
                appointments={setterAppointments}
                onResync={handleResync}
                onReassignAttribution={handleReassignAttribution}
                isAdmin={true}
              />
            )}

            <ScrollToTopButton />
          </>
        )}
      </div>
    </DashboardShell>
  );
}
