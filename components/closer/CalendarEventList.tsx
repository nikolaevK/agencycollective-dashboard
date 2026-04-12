"use client";

import { useRef, useEffect } from "react";
import { format, parseISO, isSameDay } from "date-fns";
import { Clock, Users, Video, ArrowRight, CheckCircle2, XCircle, User, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  start: string;
  end: string;
  attendees: string[];
  meetLink: string | null;
  status: string;
  allDay: boolean;
  calendarName?: string;
}

export interface LinkedDealInfo {
  dealId: string;
  googleEventId: string;
  closerId: string;
  closerName?: string;
}

interface Props {
  events: CalendarEvent[];
  /** Event IDs that have a linked deal */
  linkedEventIds?: Set<string>;
  /** Deal info for linked events */
  linkedDeals?: LinkedDealInfo[];
  /** Attendance status per event ID: "showed" | "no_show" */
  attendance?: Record<string, string>;
  /** Create a deal from this event */
  onLinkDeal?: (event: CalendarEvent) => void;
  /** Toggle showed/no-show for any event. Pass null to clear. */
  onAttendanceChange?: (eventId: string, status: "showed" | "no_show" | null) => void;
  /** Edit a linked deal */
  onEditDeal?: (dealId: string) => void;
  /** Admin view (read-only attendance, shows closer name) */
  isAdmin?: boolean;
}

function groupByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const groups = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    if (!event.start) continue;
    // Use parseISO + format to convert to local timezone date, not raw string slicing
    // which can mis-group events when the ISO string is in UTC or another offset
    let dayKey: string;
    try {
      dayKey = format(parseISO(event.start), "yyyy-MM-dd");
    } catch {
      dayKey = event.start.slice(0, 10);
    }
    if (!dayKey) continue;
    const existing = groups.get(dayKey) ?? [];
    existing.push(event);
    groups.set(dayKey, existing);
  }
  return groups;
}

function formatTime(dateStr: string, allDay: boolean): string {
  if (allDay) return "All day";
  try {
    return format(parseISO(dateStr), "h:mm a");
  } catch {
    return dateStr;
  }
}

function formatDayHeader(dateStr: string): string {
  try {
    const date = parseISO(dateStr);
    if (isSameDay(date, new Date())) return "Today";
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (isSameDay(date, tomorrow)) return "Tomorrow";
    return format(date, "EEEE, MMMM d");
  } catch {
    return dateStr;
  }
}

export function CalendarEventList({
  events,
  linkedEventIds,
  linkedDeals,
  attendance,
  onLinkDeal,
  onAttendanceChange,
  onEditDeal,
  isAdmin,
}: Props) {
  const todayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (todayRef.current) {
      todayRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [events]);

  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">No events found for this period.</p>
      </div>
    );
  }

  const grouped = groupByDay(events);

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([dayKey, dayEvents]) => {
        let isToday = false;
        try { isToday = isSameDay(parseISO(dayKey), new Date()); } catch {}
        return (
        <div key={dayKey} ref={isToday ? todayRef : undefined}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            {formatDayHeader(dayKey)}
          </h3>
          <div className="space-y-2">
            {dayEvents.map((event) => {
              const isLinked = linkedEventIds?.has(event.id);
              const dealInfo = linkedDeals?.find((d) => d.googleEventId === event.id);
              const eventAttendance = attendance?.[event.id] as "showed" | "no_show" | undefined;

              return (
                <div
                  key={event.id}
                  className={cn(
                    "rounded-xl border bg-card p-4 transition-colors",
                    isLinked
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-border/50 dark:border-white/[0.06] hover:bg-muted/30"
                  )}
                >
                  {/* Top row: title + link button */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {event.title}
                        </p>
                        {event.calendarName && (
                          <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-muted text-muted-foreground">
                            {event.calendarName}
                          </span>
                        )}
                        {isLinked && (
                          <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                            Deal Linked
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-1.5">
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatTime(event.start, event.allDay)}
                          {!event.allDay && ` – ${formatTime(event.end, false)}`}
                        </span>
                        {event.attendees.length > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Users className="h-3 w-3" />
                            {event.attendees.length} attendee{event.attendees.length !== 1 ? "s" : ""}
                          </span>
                        )}
                        {event.meetLink && (
                          <a
                            href={event.meetLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <Video className="h-3 w-3" />
                            Meet
                          </a>
                        )}
                        {isAdmin && dealInfo?.closerName && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <User className="h-3 w-3" />
                            {dealInfo.closerName}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right side: Link as Deal button for unlinked */}
                    {onLinkDeal && !isLinked && (
                      <button
                        onClick={() => onLinkDeal(event)}
                        className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-primary/30 bg-primary/5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                      >
                        Link as Deal
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {/* Bottom row: Show/No-Show buttons on EVERY card */}
                  {onAttendanceChange && (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/30 dark:border-white/[0.04]">
                      <button
                        onClick={() => onAttendanceChange(event.id, eventAttendance === "showed" ? null : "showed")}
                        className={cn(
                          "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-semibold transition-colors",
                          eventAttendance === "showed"
                            ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                            : "border-border/50 bg-background text-muted-foreground hover:border-emerald-500/30 hover:bg-emerald-500/5 hover:text-emerald-700 dark:hover:text-emerald-400"
                        )}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Showed
                      </button>
                      <button
                        onClick={() => onAttendanceChange(event.id, eventAttendance === "no_show" ? null : "no_show")}
                        className={cn(
                          "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-semibold transition-colors",
                          eventAttendance === "no_show"
                            ? "border-red-500/50 bg-red-500/15 text-red-700 dark:text-red-400"
                            : "border-border/50 bg-background text-muted-foreground hover:border-red-500/30 hover:bg-red-500/5 hover:text-red-700 dark:hover:text-red-400"
                        )}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        No Show
                      </button>

                      {/* Edit button for linked deals */}
                      {isLinked && dealInfo && onEditDeal && (
                        <button
                          onClick={() => onEditDeal(dealInfo.dealId)}
                          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border/50 bg-background text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors ml-auto"
                        >
                          <Pencil className="h-3 w-3" />
                          Edit Deal
                        </button>
                      )}
                    </div>
                  )}

                  {/* Admin: read-only attendance badge */}
                  {isAdmin && eventAttendance && (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/30 dark:border-white/[0.04]">
                      <span className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide",
                        eventAttendance === "showed"
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                          : "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400"
                      )}>
                        {eventAttendance === "showed" ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        {eventAttendance === "showed" ? "Showed" : "No Show"}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        );
      })}
    </div>
  );
}
