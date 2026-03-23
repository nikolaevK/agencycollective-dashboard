"use client";

import { format, parseISO, isSameDay } from "date-fns";
import { Clock, Users, Video, ArrowRight } from "lucide-react";
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

interface Props {
  events: CalendarEvent[];
  linkedEventIds?: Set<string>;
  onLinkDeal?: (event: CalendarEvent) => void;
}

function groupByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const groups = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const dayKey = event.start.slice(0, 10); // YYYY-MM-DD
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

export function CalendarEventList({ events, linkedEventIds, onLinkDeal }: Props) {
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
      {Array.from(grouped.entries()).map(([dayKey, dayEvents]) => (
        <div key={dayKey}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            {formatDayHeader(dayKey)}
          </h3>
          <div className="space-y-2">
            {dayEvents.map((event) => {
              const isLinked = linkedEventIds?.has(event.id);
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
                      </div>
                    </div>

                    {onLinkDeal && !isLinked && (
                      <button
                        onClick={() => onLinkDeal(event)}
                        className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-primary/30 bg-primary/5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                      >
                        Link as Deal
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    )}
                    {isLinked && (
                      <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        Linked
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
