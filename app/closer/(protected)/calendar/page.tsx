"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks } from "date-fns";
import { GoogleConnectCard } from "@/components/closer/GoogleConnectCard";
import { CalendarEventList, type CalendarEvent, type LinkedDealInfo } from "@/components/closer/CalendarEventList";
import { LinkEventDealModal } from "@/components/closer/LinkEventDealModal";
import { UnifiedDealForm } from "@/components/shared/UnifiedDealForm";
import type { DealPublic } from "@/components/closers/types";

export default function CloserCalendarPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [linkingEvent, setLinkingEvent] = useState<CalendarEvent | null>(null);
  const [editingDealId, setEditingDealId] = useState<string | null>(null);
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

  // Deals for linked event indicators
  const { data: deals = [] } = useQuery<DealPublic[]>({
    queryKey: ["closer-deals"],
    queryFn: async () => {
      const res = await fetch("/api/closer/deals");
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 30_000,
  });

  // Attendance records (show/no-show per event)
  const { data: attendance = {} } = useQuery<Record<string, string>>({
    queryKey: ["closer-attendance"],
    queryFn: async () => {
      const res = await fetch("/api/closer/attendance");
      const json = await res.json();
      return json.data ?? {};
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

  const linkedDeals: LinkedDealInfo[] = useMemo(() => {
    return deals
      .filter((d) => d.googleEventId)
      .map((d) => ({
        dealId: d.id,
        googleEventId: d.googleEventId!,
        closerId: d.closerId,
      }));
  }, [deals]);

  async function handleAttendanceChange(eventId: string, showStatus: "showed" | "no_show" | null) {
    if (showStatus === null) {
      // Clear attendance
      const res = await fetch(`/api/closer/attendance?eventId=${encodeURIComponent(eventId)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["closer-attendance"] });
        queryClient.invalidateQueries({ queryKey: ["closer-stats"] });
      }
    } else {
      const res = await fetch("/api/closer/attendance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, showStatus }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["closer-attendance"] });
        queryClient.invalidateQueries({ queryKey: ["closer-stats"] });
      }
    }
  }

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
                linkedDeals={linkedDeals}
                attendance={attendance}
                onLinkDeal={(event) => setLinkingEvent(event)}
                onAttendanceChange={handleAttendanceChange}
                onEditDeal={(dealId) => setEditingDealId(dealId)}
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

        {/* Edit deal modal */}
        {editingDealId && (() => {
          const deal = deals.find((d) => d.id === editingDealId);
          if (!deal) return null;
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditingDealId(null)} />
              <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-border bg-card shadow-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                  <h3 className="text-lg font-semibold text-foreground">Edit Deal</h3>
                  <button onClick={() => setEditingDealId(null)} className="text-muted-foreground hover:text-foreground">
                    <span className="sr-only">Close</span>&times;
                  </button>
                </div>
                <div className="p-6">
                  <UnifiedDealForm
                    mode="edit"
                    context="closer"
                    initialData={deal}
                    onSuccess={() => {
                      setEditingDealId(null);
                      queryClient.invalidateQueries({ queryKey: ["closer-deals"] });
                      queryClient.invalidateQueries({ queryKey: ["closer-stats"] });
                    }}
                    onCancel={() => setEditingDealId(null)}
                  />
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </main>
  );
}
