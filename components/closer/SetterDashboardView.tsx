"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarPlus } from "lucide-react";
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
import type { SetterTrends } from "@/lib/metricSeries";
import { TimeFrameSelector } from "@/components/shared/TimeFrameSelector";
import { TIME_FRAME_LABELS, type TimeFrame, type TimeFrameKey } from "@/lib/timeFrame";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

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
  timeFrame: { since: string | null; until: string | null };
  recentDeals: SetterRecentDeal[];
  followUps: SetterFollowUp[];
  noShowFollowUps: NoShowFollowUp[];
  /** Card trend lines (requested with `trends=1`). */
  trends?: SetterTrends | null;
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
  /** Selected time frame, owned by the page so it survives polling. */
  timeFrame: TimeFrame;
  onTimeFrameChange: (next: TimeFrame) => void;
  /** When true, hide the appointment editor entry points and the FAB / nav
   *  link to /closer/setter/appointments — those need a c_sess and would
   *  401 for an admin viewer anyway. */
  readOnly?: boolean;
  /** Called after the inline editor saves so the page can invalidate its
   *  own query cache. Required when readOnly is false. */
  onMutated?: () => void;
}

function windowLabel(tf: TimeFrame): string {
  if (tf.key === "custom" && tf.since && tf.until) return `${tf.since} → ${tf.until}`;
  return TIME_FRAME_LABELS[tf.key as TimeFrameKey] ?? "Selected window";
}

/** Pure presentational dashboard. Caller owns the fetch + loading/error
 *  states so the same component renders for the setter's own session and
 *  for an admin viewing them. */
export function SetterDashboardView({ data, timeFrame, onTimeFrameChange, readOnly, onMutated }: Props) {
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
      // Tier picker starts unselected on the dashboard's quick-edit view; the
      // setter can pick one in the modal and POST will persist it.
      setterTier: editing.setterTier ?? null,
      setterTierAt: null,
      createdAt: "",
      updatedAt: "",
    };
    return { event, appointment };
  }, [editing, data.setter.id]);

  const { setter, stats, recentDeals, followUps } = data;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 pb-24 md:px-6 md:pb-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back, {setter.displayName.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Attribution + follow-ups at a glance. Pick a tier on each
            appointment to set your payout — A 3%, B 2%, C $25/attended, D $0.
          </p>
        </div>
        {!readOnly && (
          <Button asChild variant="outline" className="hidden sm:inline-flex">
            <Link href="/closer/setter/appointments">
              <CalendarPlus />
              Go to Appointments
            </Link>
          </Button>
        )}
      </div>

      {/* Time-frame selector */}
      <div className="mb-6">
        <TimeFrameSelector value={timeFrame} onChange={onTimeFrameChange} />
      </div>

      {/* Metrics — lifetime + selected window */}
      <SetterBentoGrid
        lifetime={stats.lifetime}
        window={stats.window}
        windowLabel={windowLabel(timeFrame)}
        isLifetimeWindow={timeFrame.key === "all"}
        followUpCount={stats.followUpCount}
        trends={data.trends}
      />

      {/* Follow-up queue */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium">Follow-up queue</h2>
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
        <h2 className="text-sm font-medium mb-3">Successful recoveries</h2>
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
          <h2 className="text-sm font-medium">Deals credited to you</h2>
          <span className="text-xs text-muted-foreground">
            {stats.lifetime.dealsLinked} total
          </span>
        </div>
        <SetterRecentDeals deals={recentDeals} />
      </section>

      {/* Active no-show follow-ups — date-window pills above, then
          search/sort/pagination handled by PaginatedFollowUpList. */}
      <section>
        <h2 className="text-sm font-medium mb-3">No-show follow-ups</h2>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={String(noShowWindow)}
          // Radix reports "" when the active item is clicked again; a window
          // can't be deselected, so ignore that.
          onValueChange={(v) => {
            const choice = WINDOW_CHOICES.find((c) => String(c.value) === v);
            if (choice) setNoShowWindow(choice.value);
          }}
          aria-label="No-show window"
          className="flex-wrap justify-start mb-4"
        >
          {WINDOW_CHOICES.map((c) => (
            <ToggleGroupItem key={String(c.value)} value={String(c.value)} className="px-3">
              {c.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

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
        <Button
          asChild
          size="icon-lg"
          className="md:hidden fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 size-14 rounded-full shadow-lg [&_svg:not([class*='size-'])]:size-6"
        >
          <Link href="/closer/setter/appointments" aria-label="Appointments">
            <CalendarPlus className="size-5" />
          </Link>
        </Button>
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
