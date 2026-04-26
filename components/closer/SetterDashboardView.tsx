"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { SetterBentoGrid } from "@/components/closer/SetterBentoGrid";
import { SetterFollowUpList } from "@/components/closer/SetterFollowUpList";
import { SetterRecentDeals } from "@/components/closer/SetterRecentDeals";
import { PaginatedFollowUpList } from "@/components/closer/PaginatedFollowUpList";
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

export interface SetterDashboardData {
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

interface Props {
  data: SetterDashboardData;
  /** When true, hide the appointment editor entry points and the FAB / nav
   *  link to /closer/setter/appointments — those need a c_sess and would
   *  401 for an admin viewer anyway. */
  readOnly?: boolean;
  /** Called after the inline editor saves so the page can invalidate its
   *  own query cache. Required when readOnly is false. */
  onMutated?: () => void;
}

/** Pure presentational dashboard. Caller owns the fetch + loading/error
 *  states so the same component renders for the setter's own session and
 *  for an admin viewing them. */
export function SetterDashboardView({ data, readOnly, onMutated }: Props) {
  const [editing, setEditing] = useState<NoShowFollowUp | null>(null);
  const [noShowWindow, setNoShowWindow] = useState<NoShowWindow>(30);

  const { activeNoShows, recoveredNoShows } = useMemo(() => {
    const all = data.noShowFollowUps;
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
  }, [data.noShowFollowUps]);

  // Date-window filter on active no-shows. Backend already returns newest-
  // first (ORDER BY updated_at DESC), so filtering preserves that order.
  // Search/sort/pagination over the filtered list is delegated to
  // PaginatedFollowUpList; this hook only narrows by window.
  const filteredActiveNoShows = useMemo(() => {
    if (noShowWindow === "all") return activeNoShows;
    const cutoffMs = Date.now() - noShowWindow * 24 * 60 * 60 * 1000;
    return activeNoShows.filter((n) => {
      const t = Date.parse(n.markedAt);
      return Number.isFinite(t) && t >= cutoffMs;
    });
  }, [activeNoShows, noShowWindow]);

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
      setterId: data.setter.id,
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
  }, [editing, data.setter.id]);

  const { setter, stats, recentDeals, followUps } = data;
  const commissionPct = (setter.commissionRate / 100).toFixed(1);

  return (
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
        {!readOnly && (
          <Link
            href="/closer/setter/appointments"
            className="hidden sm:inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-primary/30 bg-primary/5 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            <CalendarPlus className="h-4 w-4" />
            Go to Appointments
          </Link>
        )}
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
        <h2 className="text-sm font-semibold text-foreground mb-3">Successful recoveries</h2>
        <PaginatedFollowUpList
          items={recoveredNoShows}
          variant="setter"
          tone="recovered"
          // Editor save would 401 from an admin session, so don't expose it.
          onEdit={readOnly ? undefined : (item) => setEditing(item)}
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

      {/* Active no-show follow-ups — date-window pills above, then
          search/sort/pagination handled by PaginatedFollowUpList. */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3">No-show follow-ups</h2>
        <div className="flex items-center gap-2 flex-wrap mb-4">
          {WINDOW_CHOICES.map((c) => (
            <button
              key={String(c.value)}
              onClick={() => setNoShowWindow(c.value)}
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

        <PaginatedFollowUpList
          items={filteredActiveNoShows}
          variant="setter"
          tone="active"
          onEdit={readOnly ? undefined : (item) => setEditing(item)}
          emptyText={
            noShowWindow === "all"
              ? "No no-shows to follow up on. Nice."
              : "No no-shows in this window. Try a wider range."
          }
        />
      </section>

      {/* Mobile FAB — hidden in read-only admin view. */}
      {!readOnly && (
        <Link
          href="/closer/setter/appointments"
          className="md:hidden fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full ac-gradient text-white shadow-lg shadow-primary/25 active:scale-95 transition-transform"
          aria-label="Appointments"
        >
          <CalendarPlus className="h-6 w-6" />
        </Link>
      )}

      {/* Inline status editor for no-show follow-ups */}
      {editorProps && !readOnly && (
        <SetterAppointmentEditor
          event={editorProps.event}
          appointment={editorProps.appointment}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onMutated?.();
          }}
        />
      )}
    </div>
  );
}
