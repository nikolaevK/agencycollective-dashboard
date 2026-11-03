"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  AlignLeft,
  ChevronDown,
  Clock,
  Flag,
  MapPin,
  Pencil,
  StickyNote,
  Users,
  Video,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGhlCrossReference } from "@/hooks/useGhlContacts";
import { GhlEventChip, buildGhlCrossReferenceInputs } from "@/components/ghl/GhlEventChip";
import type { CalendarEvent } from "@/components/closer/CalendarEventList";
import type { AppointmentRecord } from "@/lib/appointments";
import { PRE_CALL_LABELS, POST_CALL_LABELS } from "@/lib/appointmentRules";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TOUCH_TARGET } from "@/components/ui/touch";
import {
  CalendarStateChip,
  CalendarStateLegend,
  CalendarStatusBadge,
  DayHeader,
  dayHeaderInfo,
  makeCalendarRefs,
  useMidnightTick,
  useNow,
} from "@/components/closer/DayHeader";
import {
  ATTENDEE_RESPONSE_META,
  EVENT_STATUS_PILL,
  POST_CALL_TONE,
  PRE_CALL_TONE,
  SETTER_STATE_ORDER,
  calendarStateStyle,
  countCalendarStates,
  setterEventState,
  type SetterCalendarState,
} from "@/components/closer/calendarState";

/** Touch screens only: grows a 16px text link (Meet, mailto) to a 32px
 *  target without changing its look. */
const LINK_TOUCH = cn(TOUCH_TARGET, "[@media(pointer:coarse)]:after:-inset-y-2");

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

export function SetterCalendarEventList({
  events,
  appointmentsByEvent,
  attendance,
  onClaim,
  onUnclaim,
  onEdit,
}: Props) {
  const todayRef = useRef<HTMLElement>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Re-render at midnight so the "Today" badge tracks the calendar day,
  // not just the data refetch cadence.
  useMidnightTick();
  // Minute clock for the time-based states (Live now / Awaiting outcome).
  const now = useNow();

  // Single GHL cross-reference fetch covering every event on the screen.
  const ghlInputs = useMemo(() => buildGhlCrossReferenceInputs(events), [events]);
  const { data: ghlData } = useGhlCrossReference(ghlInputs);

  // One state per event (rail + chip + legend count) — precedence in
  // components/closer/calendarState.ts.
  const eventStates = useMemo(() => {
    const m = new Map<string, SetterCalendarState>();
    for (const e of events) {
      const appt = appointmentsByEvent[e.id];
      m.set(
        e.id,
        setterEventState({
          event: e,
          claimed: Boolean(appt),
          preCallStatus: appt?.preCallStatus,
          postCallStatus: appt?.postCallStatus,
          attendance: attendance?.[e.id],
          now,
        })
      );
    }
    return m;
  }, [events, appointmentsByEvent, attendance, now]);
  const stateCounts = useMemo(() => countCalendarStates(eventStates.values()), [eventStates]);

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
      <Card className="p-12 text-center">
        <p className="text-sm text-muted-foreground">No events found for this period.</p>
      </Card>
    );
  }

  const grouped = groupByDay(events);
  const calendarRefs = makeCalendarRefs();

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
    <div>
    <CalendarStateLegend counts={stateCounts} order={SETTER_STATE_ORDER} />
    <div className="space-y-8">
      {Array.from(grouped.entries()).map(([dayKey, dayEvents]) => {
        const info = dayHeaderInfo(dayKey, calendarRefs);
        return (
          <section
            key={dayKey}
            ref={info.isToday ? todayRef : undefined}
            aria-label={info.longLabel || undefined}
            // Same offset var as DayHeader's sticky top (the page mirrors
            // its nav height into it), so today's header lands below the nav.
            className={info.isToday ? "scroll-mt-[var(--calendar-nav-h,9rem)]" : undefined}
          >
            <DayHeader info={info} eventCount={dayEvents.length} />
            <div className="space-y-2">
              {dayEvents.map((event) => {
                const appt = appointmentsByEvent[event.id];
                const claimed = Boolean(appt);
                const isPending = pending === event.id;
                const eventAttendance = attendance?.[event.id] as "showed" | "no_show" | undefined;
                const state = eventStates.get(event.id) ?? "unclaimed";
                const look = calendarStateStyle(state);

                return (
                  <Card
                    key={event.id}
                    className={cn(
                      "relative p-4 transition-colors hover:bg-muted/30",
                      look.ring,
                      look.card
                    )}
                  >
                    {/* State rail — same color as the state chip + legend. */}
                    <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", look.rail)} />
                    {/* Top row: title + chips, Claim/Unclaim. Mobile stacks
                        the button full-width below; desktop puts it right. */}
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
                          <p className={cn("text-sm font-semibold text-foreground break-words sm:break-normal sm:truncate sm:flex-1 sm:min-w-0", look.title)}>
                            {event.title}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 sm:shrink-0">
                            <CalendarStateChip state={state} />
                            {event.calendarName && (
                              <Badge variant="secondary" className="max-w-[14rem] font-normal text-muted-foreground" title={event.calendarName}>
                                <span className="truncate">{event.calendarName}</span>
                              </Badge>
                            )}
                            {/* Attendance stays visible when a later step
                                (the post-call status) is the card's state. */}
                            {eventAttendance === "showed" && state !== "showed" && (
                              <CalendarStatusBadge tone="success">Showed</CalendarStatusBadge>
                            )}
                            {eventAttendance === "no_show" && state !== "no_show" && (
                              <CalendarStatusBadge tone="danger">No show</CalendarStatusBadge>
                            )}
                            {EVENT_STATUS_PILL[event.status] && !(event.status === "cancelled" && state === "cancelled") && (
                              <CalendarStatusBadge tone={EVENT_STATUS_PILL[event.status].tone}>
                                {EVENT_STATUS_PILL[event.status].label}
                              </CalendarStatusBadge>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2">
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
                              className={cn("inline-flex items-center gap-1 text-xs text-primary hover:underline", LINK_TOUCH)}
                            >
                              <Video className="h-3 w-3" />
                              Meet
                            </a>
                          )}
                          {event.location && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground max-w-[12rem] sm:max-w-[16rem] truncate" title={event.location}>
                              <MapPin className="h-3 w-3 shrink-0" />
                              {event.location}
                            </span>
                          )}
                          <GhlEventChip
                            event={{
                              id: event.id,
                              title: event.title,
                              startTime: event.start,
                              endTime: event.end,
                            }}
                            data={ghlData}
                          />
                        </div>
                      </div>

                      {!claimed ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleClaim(event)}
                          disabled={isPending}
                          className="h-10 sm:h-8 w-full sm:w-auto sm:shrink-0"
                        >
                          <Flag className="size-3.5" />
                          Claim
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleUnclaim(event)}
                          disabled={isPending}
                          className="h-10 sm:h-8 w-full sm:w-auto sm:shrink-0 text-muted-foreground"
                        >
                          <X className="size-3.5" />
                          Unclaim
                        </Button>
                      )}
                    </div>

                    {/* Details expander — same shape as closer/admin view */}
                    {(event.description || event.attendees.length > 0) && (() => {
                      const isOpen = expanded.has(event.id);
                      return (
                        <div className="mt-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            onClick={() => toggleExpanded(event.id)}
                            className="-ml-2.5 h-8 sm:h-6 text-muted-foreground"
                          >
                            <ChevronDown className={cn("transition-transform", isOpen && "rotate-180")} />
                            {isOpen ? "Hide details" : "Details"}
                          </Button>
                          {isOpen && (
                            <div className="mt-2 space-y-2.5 rounded-2xl bg-muted/50 p-3">
                              {event.description && (
                                <div className="flex items-start gap-1.5 text-xs text-muted-foreground min-w-0">
                                  <AlignLeft className="h-3 w-3 mt-0.5 shrink-0" />
                                  <p className="min-w-0 flex-1 whitespace-pre-wrap break-words">{event.description}</p>
                                </div>
                              )}
                              {event.attendees.length > 0 && (
                                <div className="flex items-start gap-1.5 text-xs min-w-0">
                                  <Users className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                                  <ul className="space-y-1 flex-1 min-w-0">
                                    {event.attendees.map((a) => (
                                      <li key={a.email} className="flex items-center gap-2 flex-wrap min-w-0">
                                        <a
                                          href={`mailto:${a.email}`}
                                          className="text-muted-foreground hover:text-foreground break-all min-w-0"
                                        >
                                          {a.displayName ? `${a.displayName} <${a.email}>` : a.email}
                                        </a>
                                        {a.responseStatus && ATTENDEE_RESPONSE_META[a.responseStatus] && (
                                          <CalendarStatusBadge tone={ATTENDEE_RESPONSE_META[a.responseStatus].tone}>
                                            {ATTENDEE_RESPONSE_META[a.responseStatus].label}
                                          </CalendarStatusBadge>
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

                    {/* Claimed card body: status chips + edit */}
                    {claimed && appt && (
                      <div className="mt-3 pt-3 border-t flex flex-wrap items-center gap-2">
                        <CalendarStatusBadge tone={PRE_CALL_TONE[appt.preCallStatus] ?? "neutral"}>
                          Pre: {PRE_CALL_LABELS[appt.preCallStatus]}
                        </CalendarStatusBadge>
                        <CalendarStatusBadge tone={POST_CALL_TONE[appt.postCallStatus] ?? "neutral"}>
                          Post: {POST_CALL_LABELS[appt.postCallStatus]}
                        </CalendarStatusBadge>
                        {appt.notes && (
                          <span className="inline-flex min-w-0 max-w-xs items-center gap-1 text-xs text-muted-foreground">
                            <StickyNote className="h-3 w-3 shrink-0" />
                            <span className="truncate">{appt.notes}</span>
                          </span>
                        )}
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => onEdit(event, appt)}
                          className="ml-auto h-9 sm:h-7"
                        >
                          <Pencil />
                          Edit
                        </Button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
    </div>
  );
}
