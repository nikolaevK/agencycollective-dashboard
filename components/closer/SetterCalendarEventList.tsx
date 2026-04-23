"use client";

import { useEffect, useRef, useState } from "react";
import { format, isSameDay, parseISO } from "date-fns";
import {
  AlignLeft,
  CheckCircle2,
  ChevronDown,
  Clock,
  Flag,
  MapPin,
  Pencil,
  PhoneCall,
  PhoneOff,
  Users,
  Video,
  X,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  AttendeeResponseStatus,
  CalendarEvent,
} from "@/components/closer/CalendarEventList";
import type { AppointmentRecord } from "@/lib/appointments";
import {
  PRE_CALL_BADGE,
  PRE_CALL_LABELS,
  PRE_CALL_STATUSES,
  POST_CALL_BADGE,
  POST_CALL_LABELS,
  POST_CALL_STATUSES,
} from "@/lib/appointments";

interface Props {
  events: CalendarEvent[];
  /** Setter's appointment claims keyed by google_event_id. */
  appointmentsByEvent: Record<string, AppointmentRecord>;
  /** Team-wide attendance (showed/no_show) keyed by google_event_id, read-only for setters. */
  attendance?: Record<string, string>;
  onClaim: (event: CalendarEvent) => void | Promise<void>;
  onUnclaim: (event: CalendarEvent) => void | Promise<void>;
  onEdit: (event: CalendarEvent, appt: AppointmentRecord) => void;
}

function groupByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const groups = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    if (!event.start) continue;
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

const RESPONSE_BADGE: Record<AttendeeResponseStatus, { label: string; cls: string }> = {
  accepted: { label: "Accepted", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  declined: { label: "Declined", cls: "bg-red-500/15 text-red-700 dark:text-red-400" },
  tentative: { label: "Maybe", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  needsAction: { label: "Pending", cls: "bg-muted/60 text-muted-foreground" },
};

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  tentative: { label: "Tentative", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  cancelled: { label: "Cancelled", cls: "bg-red-500/15 text-red-700 dark:text-red-400" },
};

export function SetterCalendarEventList({
  events,
  appointmentsByEvent,
  attendance,
  onClaim,
  onUnclaim,
  onEdit,
}: Props) {
  const todayRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (todayRef.current) {
      todayRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [events]);

  function toggleExpanded(eventId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }

  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">No events found for this period.</p>
      </div>
    );
  }

  const grouped = groupByDay(events);

  async function handleClaim(event: CalendarEvent) {
    setPending(event.id);
    try {
      await onClaim(event);
    } finally {
      setPending(null);
    }
  }

  async function handleUnclaim(event: CalendarEvent) {
    setPending(event.id);
    try {
      await onUnclaim(event);
    } finally {
      setPending(null);
    }
  }

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
                const appt = appointmentsByEvent[event.id];
                const claimed = Boolean(appt);
                const isPending = pending === event.id;
                const eventAttendance = attendance?.[event.id] as "showed" | "no_show" | undefined;

                return (
                  <div
                    key={event.id}
                    className={cn(
                      "rounded-xl border bg-card p-4 transition-colors",
                      claimed
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : "border-border/50 dark:border-white/[0.06] hover:bg-muted/30"
                    )}
                  >
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {event.title}
                          </p>
                          {event.calendarName && (
                            <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-muted text-muted-foreground">
                              {event.calendarName}
                            </span>
                          )}
                          {claimed && (
                            <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                              <Flag className="h-3 w-3" />
                              Claimed
                            </span>
                          )}
                          {eventAttendance === "showed" && (
                            <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" />
                              Showed
                            </span>
                          )}
                          {eventAttendance === "no_show" && (
                            <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-red-500/15 text-red-700 dark:text-red-400">
                              <XCircle className="h-3 w-3" />
                              No show
                            </span>
                          )}
                          {STATUS_PILL[event.status] && (
                            <span className={cn(
                              "shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium",
                              STATUS_PILL[event.status].cls
                            )}>
                              {STATUS_PILL[event.status].label}
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
                          {event.location && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground max-w-[16rem] truncate" title={event.location}>
                              <MapPin className="h-3 w-3 shrink-0" />
                              {event.location}
                            </span>
                          )}
                        </div>
                      </div>

                      {!claimed ? (
                        <button
                          onClick={() => handleClaim(event)}
                          disabled={isPending}
                          className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-primary/30 bg-primary/5 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50 transition-colors"
                        >
                          <Flag className="h-3 w-3" />
                          Claim
                        </button>
                      ) : (
                        <button
                          onClick={() => handleUnclaim(event)}
                          disabled={isPending}
                          className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border/50 bg-background text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-50 transition-colors"
                        >
                          <X className="h-3 w-3" />
                          Unclaim
                        </button>
                      )}
                    </div>

                    {/* Details expander — same shape as closer/admin view */}
                    {(event.description || event.attendees.length > 0) && (() => {
                      const isOpen = expanded.has(event.id);
                      return (
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(event.id)}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <ChevronDown className={cn("h-3 w-3 transition-transform", isOpen && "rotate-180")} />
                            {isOpen ? "Hide details" : "Details"}
                          </button>
                          {isOpen && (
                            <div className="mt-2 space-y-2.5 rounded-lg border border-border/40 bg-muted/20 p-3">
                              {event.description && (
                                <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                  <AlignLeft className="h-3 w-3 mt-0.5 shrink-0" />
                                  <p className="whitespace-pre-wrap break-words">{event.description}</p>
                                </div>
                              )}
                              {event.attendees.length > 0 && (
                                <div className="flex items-start gap-1.5 text-xs">
                                  <Users className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                                  <ul className="space-y-1 flex-1 min-w-0">
                                    {event.attendees.map((a) => (
                                      <li key={a.email} className="flex items-center gap-2 flex-wrap">
                                        <a
                                          href={`mailto:${a.email}`}
                                          className="text-muted-foreground hover:text-foreground truncate"
                                        >
                                          {a.displayName ? `${a.displayName} <${a.email}>` : a.email}
                                        </a>
                                        {a.responseStatus && RESPONSE_BADGE[a.responseStatus] && (
                                          <span className={cn(
                                            "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium",
                                            RESPONSE_BADGE[a.responseStatus].cls
                                          )}>
                                            {RESPONSE_BADGE[a.responseStatus].label}
                                          </span>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Claimed card body: status pills + edit */}
                    {claimed && appt && (
                      <div className="mt-3 pt-3 border-t border-border/30 dark:border-white/[0.04] flex flex-wrap items-center gap-2">
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold",
                          PRE_CALL_BADGE[appt.preCallStatus]
                        )}>
                          <PhoneCall className="h-3 w-3" />
                          Pre: {PRE_CALL_LABELS[appt.preCallStatus]}
                        </span>
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold",
                          POST_CALL_BADGE[appt.postCallStatus]
                        )}>
                          <PhoneOff className="h-3 w-3" />
                          Post: {POST_CALL_LABELS[appt.postCallStatus]}
                        </span>
                        {appt.notes && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-muted-foreground bg-muted/50 max-w-xs truncate">
                            <CheckCircle2 className="h-3 w-3" />
                            {appt.notes}
                          </span>
                        )}
                        <button
                          onClick={() => onEdit(event, appt)}
                          className="ml-auto inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border/50 bg-background text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </button>
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

