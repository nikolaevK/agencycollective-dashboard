"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SetterBentoGrid } from "@/components/closer/SetterBentoGrid";
import { SetterFollowUpList } from "@/components/closer/SetterFollowUpList";
import { SetterRecentDeals } from "@/components/closer/SetterRecentDeals";
import { NoShowFollowUpList } from "@/components/closer/NoShowFollowUpList";
import { SetterAppointmentEditor } from "@/components/closer/SetterAppointmentEditor";
import type { CalendarEvent } from "@/components/closer/CalendarEventList";
import type {
  AppointmentRecord,
  PostCallStatus,
  PreCallStatus,
} from "@/lib/appointments";
import type { SetterFollowUp, SetterRecentDeal, SetterStats } from "@/lib/setterStats";
import type { NoShowFollowUp } from "@/lib/eventAttendance";

// Post-call states that count as a successful re-engagement. Anything else
// (needs_followup, not_called, no_answer, disqualified) stays in the active
// bucket so the setter keeps working it.
const RECOVERED_STATUSES = new Set(["followed_up", "qualified"]);

interface StatsResponse {
  setter: {
    id: string;
    displayName: string;
    commissionRate: number;
  };
  stats: SetterStats;
  recentDeals: SetterRecentDeal[];
  followUps: SetterFollowUp[];
  noShowFollowUps: NoShowFollowUp[];
}

type NoShowWindow = 7 | 30 | 90 | "all";
const WINDOW_CHOICES: { value: NoShowWindow; label: string }[] = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
  { value: "all", label: "All time" },
];
const NO_SHOW_PAGE_SIZE = 10;

export default function SetterDashboardPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<NoShowFollowUp | null>(null);
  const [noShowWindow, setNoShowWindow] = useState<NoShowWindow>(30);
  const [noShowPage, setNoShowPage] = useState(0);

  const { data, isLoading } = useQuery<StatsResponse>({
    queryKey: ["setter-stats"],
    queryFn: async () => {
      const res = await fetch("/api/closer/setter/stats");
      const json = await res.json();
      return json.data;
    },
    // Paired stale/refetch: 2 min aligns with the Google Calendar cache
    // TTL, so polling doesn't constantly miss the cache.
    staleTime: 120_000,
    refetchInterval: 120_000,
  });

  const { activeNoShows, recoveredNoShows } = useMemo(() => {
    const all = data?.noShowFollowUps ?? [];
    const active: NoShowFollowUp[] = [];
    const recovered: NoShowFollowUp[] = [];
    for (const n of all) {
      if (n.postCallStatus && RECOVERED_STATUSES.has(n.postCallStatus)) {
        recovered.push(n);
      } else {
        active.push(n);
      }
    }
    return { activeNoShows: active, recoveredNoShows: recovered };
  }, [data?.noShowFollowUps]);

  // Date-window filter on active no-shows. Backend already returns newest-
  // first (ORDER BY updated_at DESC), so filtering preserves that order.
  const filteredActiveNoShows = useMemo(() => {
    if (noShowWindow === "all") return activeNoShows;
    const cutoffMs = Date.now() - noShowWindow * 24 * 60 * 60 * 1000;
    return activeNoShows.filter((n) => {
      const t = Date.parse(n.markedAt);
      return Number.isFinite(t) && t >= cutoffMs;
    });
  }, [activeNoShows, noShowWindow]);

  const pageCount = Math.max(1, Math.ceil(filteredActiveNoShows.length / NO_SHOW_PAGE_SIZE));
  const safePage = Math.min(noShowPage, pageCount - 1);
  const pagedNoShows = useMemo(
    () => filteredActiveNoShows.slice(safePage * NO_SHOW_PAGE_SIZE, (safePage + 1) * NO_SHOW_PAGE_SIZE),
    [filteredActiveNoShows, safePage]
  );

  // Build a minimal CalendarEvent + AppointmentRecord from the follow-up row
  // so we can hand them to the existing SetterAppointmentEditor. The editor
  // only reads `event.id` / `event.title` and the mutable appointment fields,
  // so a stub suffices even when the Google event isn't fetched this week.
  const editorProps = useMemo(() => {
    if (!editing) return null;
    const event: CalendarEvent = {
      id: editing.googleEventId,
      title: editing.clientName ?? "Appointment",
      description: null,
      location: null,
      start: editing.scheduledAt ?? "",
      end: "",
      attendees: [],
      meetLink: null,
      status: "confirmed",
      allDay: false,
    };
    const appointment: AppointmentRecord = {
      id: editing.appointmentId ?? "",
      setterId: data?.setter.id ?? "",
      googleEventId: editing.googleEventId,
      clientName: editing.clientName,
      clientEmail: editing.clientEmail,
      scheduledAt: editing.scheduledAt,
      preCallStatus: (editing.preCallStatus ?? "not_called") as PreCallStatus,
      postCallStatus: (editing.postCallStatus ?? "not_called") as PostCallStatus,
      notes: editing.setterNotes,
      createdAt: "",
      updatedAt: "",
    };
    return { event, appointment };
  }, [editing, data?.setter.id]);

  if (isLoading || !data) {
    return (
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
          <div className="mb-6">
            <div className="h-7 w-48 rounded bg-muted animate-pulse mb-2" />
            <div className="h-4 w-64 rounded bg-muted animate-pulse" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-28 rounded-xl bg-muted/50 animate-pulse" />
            ))}
          </div>
          <div className="h-64 rounded-xl bg-muted/50 animate-pulse" />
        </div>
      </main>
    );
  }

  const { setter, stats, recentDeals, followUps } = data;
  const commissionPct = (setter.commissionRate / 100).toFixed(1);

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Welcome back, {setter.displayName.split(" ")[0]}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Attribution + follow-ups at a glance. You earn{" "}
              <span className="font-semibold text-foreground">{commissionPct}%</span>{" "}
              on every paid deal you sourced.
            </p>
          </div>
          <Link
            href="/closer/setter/appointments"
            className="hidden sm:inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-primary/30 bg-primary/5 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            <CalendarPlus className="h-4 w-4" />
            Go to Appointments
          </Link>
        </div>

        {/* Metrics */}
        <SetterBentoGrid
          appointmentsSet={stats.appointmentsSet}
          showRate={stats.showRate}
          showCount={stats.showCount}
          noShowCount={stats.noShowCount}
          dealsLinked={stats.dealsLinked}
          dealsClosed={stats.dealsClosed}
          revenueAttributed={stats.revenueAttributed}
          commissionEarned={stats.commissionEarned}
          pendingDeals={stats.pendingDeals}
          followUpCount={stats.followUpCount}
        />

        {/* Follow-up queue */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Follow-up queue</h2>
            <span className="text-xs text-muted-foreground">
              {followUps.length < stats.followUpCount
                ? `Showing ${followUps.length} of ${stats.followUpCount} outstanding`
                : `${stats.followUpCount} outstanding`}
            </span>
          </div>
          <SetterFollowUpList followUps={followUps} />
        </section>

        {/* Successful recoveries */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Successful recoveries</h2>
            <span className="text-xs text-muted-foreground">
              {recoveredNoShows.length} recovered
            </span>
          </div>
          <NoShowFollowUpList
            items={recoveredNoShows}
            variant="setter"
            tone="recovered"
            onEdit={(item) => setEditing(item)}
            emptyText="No recoveries yet. Mark a follow-up as qualified or followed up and it lands here."
          />
        </section>

        {/* Deals credited to the setter */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Deals credited to you</h2>
            <span className="text-xs text-muted-foreground">
              {stats.dealsLinked} total
            </span>
          </div>
          <SetterRecentDeals deals={recentDeals} />
        </section>

        {/* Active no-show follow-ups — filtered by date + paginated */}
        <section>
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <h2 className="text-sm font-semibold text-foreground">No-show follow-ups</h2>
            <span className="text-xs text-muted-foreground">
              {filteredActiveNoShows.length} of {activeNoShows.length} in window
            </span>
          </div>
          {/* Window pills */}
          <div className="flex items-center gap-2 flex-wrap mb-4">
            {WINDOW_CHOICES.map((c) => (
              <button
                key={String(c.value)}
                onClick={() => {
                  setNoShowWindow(c.value);
                  setNoShowPage(0);
                }}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  noShowWindow === c.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-muted-foreground hover:text-foreground"
                )}
              >
                {c.label}
              </button>
            ))}
          </div>

          <NoShowFollowUpList
            items={pagedNoShows}
            variant="setter"
            tone="active"
            onEdit={(item) => setEditing(item)}
            emptyText={
              noShowWindow === "all"
                ? "No no-shows to follow up on. Nice."
                : "No no-shows in this window. Try a wider range."
            }
          />

          {/* Paginator — hidden when a single page covers the list */}
          {pageCount > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={() => setNoShowPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </button>
              <p className="text-xs text-muted-foreground">
                Page {safePage + 1} of {pageCount}
              </p>
              <button
                onClick={() => setNoShowPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={safePage >= pageCount - 1}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </section>

        {/* Mobile FAB */}
        <Link
          href="/closer/setter/appointments"
          className="md:hidden fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full ac-gradient text-white shadow-lg shadow-primary/25 active:scale-95 transition-transform"
          aria-label="Appointments"
        >
          <CalendarPlus className="h-6 w-6" />
        </Link>

        {/* Inline status editor for no-show follow-ups */}
        {editorProps && (
          <SetterAppointmentEditor
            event={editorProps.event}
            appointment={editorProps.appointment}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              // Refresh dashboard so the card moves between Active and
              // Successful recoveries based on the new post_call_status.
              queryClient.invalidateQueries({ queryKey: ["setter-stats"] });
              queryClient.invalidateQueries({ queryKey: ["setter-appointments"] });
            }}
          />
        )}
      </div>
    </main>
  );
}
