"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Clock, Users, Video, ArrowRight, CheckCircle2, XCircle, User, Pencil, Flag, Mail, StickyNote, MapPin, ChevronDown, AlignLeft, RefreshCw, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PRE_CALL_LABELS,
  POST_CALL_LABELS,
  type AppointmentIndexEntry,
  type PostCallStatus,
  type PreCallStatus,
} from "@/lib/appointments";
import { Badge, StatusBadge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DayHeader, dayHeaderInfo, makeCalendarRefs, useMidnightTick } from "@/components/closer/DayHeader";
import { useGhlCrossReference } from "@/hooks/useGhlContacts";
import { GhlEventChip, buildGhlCrossReferenceInputs } from "@/components/ghl/GhlEventChip";
import {
  getSubAccount,
  isValidSubAccountId,
  type GhlSubAccountId,
} from "@/lib/ghl/subAccounts";

export type AttendeeResponseStatus =
  | "needsAction"
  | "declined"
  | "tentative"
  | "accepted";

export interface CalendarAttendee {
  email: string;
  displayName: string | null;
  responseStatus: AttendeeResponseStatus | null;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start: string;
  end: string;
  attendees: CalendarAttendee[];
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

export interface GhlSyncEntry {
  dashboardStatus: "showed" | "no_show" | null;
  ghlStatus: string | null;
  syncState: "synced" | "pending" | "out_of_sync";
  /** Which GHL sub-account the linked appointment belongs to. Drives the
   *  small badge on the sync chip. Optional for backward compat with any
   *  caller that hasn't been updated yet. */
  subAccountId?: GhlSubAccountId | null;
}

interface Props {
  events: CalendarEvent[];
  /** Event IDs that have a linked deal */
  linkedEventIds?: Set<string>;
  /** Deal info for linked events */
  linkedDeals?: LinkedDealInfo[];
  /** Attendance status per event ID: "showed" | "no_show" */
  attendance?: Record<string, string>;
  /** Closer attributed to each event's attendance row (admin view only).
   *  Same key set as `attendance`. Drives the reassign-picker dropdown. */
  attendanceCloserId?: Record<string, string>;
  /** Active closers available as reassignment targets. Required to render
   *  the admin reassign-picker; omit to hide it. */
  closers?: Array<{ id: string; displayName: string }>;
  /** GHL sync state per event ID. Present only for events linked to a GHL
   *  appointment; absence = non-GHL event (no chip). */
  ghlSync?: Record<string, GhlSyncEntry>;
  /** Setter-claim info per event ID (notes, flags, client info). */
  appointments?: Record<string, AppointmentIndexEntry>;
  /** Create a deal from this event */
  onLinkDeal?: (event: CalendarEvent) => void;
  /** Toggle showed/no-show for any event. Pass null to clear. */
  onAttendanceChange?: (eventId: string, status: "showed" | "no_show" | null) => void;
  /** Manual force-sync. "push" = dashboard → GHL, "pull" = GHL → dashboard. */
  onResync?: (eventId: string, direction: "push" | "pull") => Promise<void> | void;
  /** Admin handler to reassign which closer owns the attendance row. */
  onReassignAttribution?: (eventId: string, toCloserId: string) => Promise<void> | void;
  /** Edit a linked deal */
  onEditDeal?: (dealId: string) => void;
  /** Admin view (read-only attendance, shows closer name) */
  isAdmin?: boolean;
}

const GHL_STATUS_LABEL: Record<string, string> = {
  showed: "Showed",
  noshow: "No-show",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  invalid: "Invalid",
  new: "New",
};

function ghlStatusLabel(s: string | null): string {
  if (!s) return "—";
  return GHL_STATUS_LABEL[s] ?? s;
}

function dashboardStatusLabel(s: "showed" | "no_show" | null): string {
  if (s === "showed") return "Showed";
  if (s === "no_show") return "No-show";
  return "—";
}

const RESPONSE_BADGE: Record<AttendeeResponseStatus, { label: string; tone: BadgeTone }> = {
  accepted: { label: "Accepted", tone: "success" },
  declined: { label: "Declined", tone: "danger" },
  tentative: { label: "Maybe", tone: "warning" },
  needsAction: { label: "Pending", tone: "neutral" },
};

const STATUS_PILL: Record<string, { label: string; tone: BadgeTone }> = {
  tentative: { label: "Tentative", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

// Status tones for the setter's pre/post-call badges (labels stay the
// shared PRE_CALL_LABELS / POST_CALL_LABELS).
const PRE_CALL_TONE: Record<PreCallStatus, BadgeTone> = {
  not_called: "neutral",
  auto_confirmed: "success",
  auto_no_answer: "warning",
  triaged_confirmed: "success",
  confirmed: "success",
  no_answer: "warning",
  voicemail: "info",
  rescheduled: "info",
  cancelled: "danger",
};

const POST_CALL_TONE: Record<PostCallStatus, BadgeTone> = {
  not_called: "neutral",
  followed_up: "success",
  needs_followup: "warning",
  qualified: "success",
  disqualified: "danger",
  no_answer: "warning",
};

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


export function CalendarEventList({
  events,
  linkedEventIds,
  linkedDeals,
  attendance,
  attendanceCloserId,
  closers,
  ghlSync,
  appointments,
  onLinkDeal,
  onAttendanceChange,
  onResync,
  onReassignAttribution,
  onEditDeal,
  isAdmin,
}: Props) {
  const todayRef = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Per-event "show full setter notes" state. Setter notes can be paragraphs
  // long and would otherwise dominate the card on mobile; we clamp to 3
  // lines by default and let the user toggle to full text.
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  // Per-event in-flight markers so the spinner lands on the exact button
  // the closer clicked. Value tracks which button (not the target attendance
  // state, which can be null for an unselect).
  const [pendingAttendance, setPendingAttendance] = useState<Map<string, "showed" | "no_show">>(new Map());
  const [pendingResync, setPendingResync] = useState<Map<string, "push" | "pull">>(new Map());
  const [pendingReassign, setPendingReassign] = useState<Set<string>>(new Set());

  function toggleNotesExpanded(eventId: string) {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }

  async function handleReassignClick(eventId: string, toCloserId: string) {
    if (!onReassignAttribution) return;
    setPendingReassign((prev) => new Set(prev).add(eventId));
    try {
      await onReassignAttribution(eventId, toCloserId);
    } finally {
      setPendingReassign((prev) => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
    }
  }

  async function handleAttendanceClick(
    eventId: string,
    clickedButton: "showed" | "no_show",
    nextStatus: "showed" | "no_show" | null
  ) {
    if (!onAttendanceChange) return;
    setPendingAttendance((prev) => new Map(prev).set(eventId, clickedButton));
    try {
      await onAttendanceChange(eventId, nextStatus);
    } finally {
      setPendingAttendance((prev) => {
        const next = new Map(prev);
        next.delete(eventId);
        return next;
      });
    }
  }

  async function handleResyncClick(eventId: string, direction: "push" | "pull") {
    if (!onResync) return;
    setPendingResync((prev) => {
      const next = new Map(prev);
      next.set(eventId, direction);
      return next;
    });
    try {
      await onResync(eventId, direction);
    } finally {
      setPendingResync((prev) => {
        const next = new Map(prev);
        next.delete(eventId);
        return next;
      });
    }
  }
  // Re-render at midnight so the "Today" badge tracks the calendar day,
  // not just the data refetch cadence.
  useMidnightTick();

  // Single GHL cross-reference fetch covering every event on the screen.
  // Each card reads its row from `ghlData` instead of firing its own
  // request — 50 cards = 1 GHL roundtrip.
  const ghlInputs = useMemo(() => buildGhlCrossReferenceInputs(events), [events]);

  // O(1) per-event lookup — the render loop below runs per visible event and
  // linkedDeals is the closer's whole linked-deal list.
  const dealByEventId = useMemo(() => {
    const m = new Map<string, LinkedDealInfo>();
    for (const d of linkedDeals ?? []) m.set(d.googleEventId, d);
    return m;
  }, [linkedDeals]);
  const { data: ghlData } = useGhlCrossReference(ghlInputs);

  // Scroll to "today" only when the week being shown actually changes —
  // not on every `events` array identity change. The poll-driven refetch
  // produces a fresh array reference every cycle even when contents are
  // identical; keying the effect on `events` directly would scroll the
  // page every 2 minutes and yank the user away from wherever they were
  // reading. The first event's date is a stable per-week identifier.
  const weekScrollKey = useMemo(() => events[0]?.start?.slice(0, 10) ?? "", [events]);
  useEffect(() => {
    if (todayRef.current) {
      todayRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [weekScrollKey]);

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

  return (
    <div className="space-y-8">
      {Array.from(grouped.entries()).map(([dayKey, dayEvents]) => {
        const info = dayHeaderInfo(dayKey, calendarRefs);
        return (
        <section
          key={dayKey}
          ref={info.isToday ? todayRef : undefined}
          aria-label={info.longLabel || undefined}
          // scroll-mt offsets scrollIntoView so the sticky week nav above
          // doesn't cover today's header on initial load. Reads the same
          // CSS var that DayHeader's `sticky top` uses, so the offsets
          // stay in lockstep with the live nav height. 9rem fallback
          // matches the DayHeader fallback for callers not running the
          // ResizeObserver.
          className={info.isToday ? "scroll-mt-[var(--calendar-nav-h,9rem)]" : undefined}
        >
          <DayHeader info={info} eventCount={dayEvents.length} />
          <div className="space-y-2">
            {dayEvents.map((event) => {
              const isLinked = linkedEventIds?.has(event.id);
              const dealInfo = dealByEventId.get(event.id);
              const eventAttendance = attendance?.[event.id] as "showed" | "no_show" | undefined;
              const setterClaim = appointments?.[event.id];
              const syncEntry = ghlSync?.[event.id];
              const pendingButton = pendingAttendance.get(event.id);
              const isSyncing = pendingButton !== undefined;
              const pendingPushPull = pendingResync.get(event.id);

              return (
                // Two-column row on desktop (time gutter + event card);
                // single column on mobile (gutter hidden, time stays
                // inline inside the card's secondary-info row so nothing
                // is lost). The gutter mirrors the card's vertical
                // padding (pt-4) so the time aligns with the title row;
                // tabular-nums keeps numerals column-aligned across rows
                // ("1:00 PM" vs "12:30 PM").
                <div key={event.id} className="flex items-start gap-3">
                  <div className="hidden sm:flex w-14 shrink-0 pt-4 justify-end">
                    <p className="text-xs font-medium text-muted-foreground tabular-nums">
                      {event.allDay ? "All day" : formatTime(event.start, false)}
                    </p>
                  </div>
                  <Card
                    className={cn(
                      "flex-1 min-w-0 p-4 transition-colors",
                      isLinked
                        ? "ring-emerald-500/40 dark:ring-emerald-500/40"
                        : "hover:bg-muted/30"
                    )}
                  >
                  {/* Header: title row + Link as Deal button.
                      Mobile stacks them; desktop puts the button on the
                      right. */}
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
                    <div className="min-w-0 flex-1">
                      {/* Title + badges. On mobile: title on its own row
                          (full width, wraps); badges wrap below it. On
                          desktop: inline with truncate on title. */}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
                        <p className="text-sm font-semibold text-foreground break-words sm:break-normal sm:truncate sm:flex-1 sm:min-w-0">
                          {event.title}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 sm:shrink-0">
                          {event.calendarName && (
                            <Badge variant="secondary" className="max-w-[14rem] font-normal text-muted-foreground" title={event.calendarName}>
                              <span className="truncate">{event.calendarName}</span>
                            </Badge>
                          )}
                          {isLinked && (
                            <StatusBadge tone="success">Deal Linked</StatusBadge>
                          )}
                          {setterClaim && (
                            <Badge variant="outline" className="gap-1 font-medium">
                              <Flag className="text-muted-foreground" />
                              Setter: {setterClaim.setterName ?? "Unknown"}
                            </Badge>
                          )}
                          {STATUS_PILL[event.status] && (
                            <StatusBadge tone={STATUS_PILL[event.status].tone}>
                              {STATUS_PILL[event.status].label}
                            </StatusBadge>
                          )}
                        </div>
                      </div>
                      {/* Secondary info row — visible on every breakpoint.
                          Uses gap-x-3 + gap-y-1.5 so pills wrap into multiple
                          rows on narrow widths without losing legibility. */}
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
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
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
                        {isAdmin && dealInfo?.closerName && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <User className="h-3 w-3" />
                            {dealInfo.closerName}
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
                          isAdmin={isAdmin}
                        />
                      </div>
                    </div>

                    {/* Link as Deal — full-width on mobile (tap target),
                        compact top-right on desktop. */}
                    {onLinkDeal && !isLinked && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onLinkDeal(event)}
                        className="h-10 sm:h-8 w-full sm:w-auto sm:shrink-0"
                      >
                        Link as Deal
                        <ArrowRight data-icon="inline-end" className="size-3.5" />
                      </Button>
                    )}
                  </div>

                  {/* Details expander — description + attendees list.
                      Secondary info (time, meet, location, etc.) lives
                      inline in the card body above this, so Details is
                      purely for the long-form content. */}
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
                                {/* min-w-0 lets the <p> shrink below its
                                    content (flex children default to
                                    min-width:auto). break-all forces long
                                    URLs (no spaces) to wrap; otherwise
                                    they'd horizontally overflow the card
                                    on mobile. */}
                                <p className="min-w-0 flex-1 whitespace-pre-wrap break-all">{event.description}</p>
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
                                      {a.responseStatus && RESPONSE_BADGE[a.responseStatus] && (
                                        <StatusBadge tone={RESPONSE_BADGE[a.responseStatus].tone}>
                                          {RESPONSE_BADGE[a.responseStatus].label}
                                        </StatusBadge>
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

                  {/* Setter claim panel — read-only view of pre/post-call notes */}
                  {setterClaim && (
                    <div className="mt-3 pt-3 border-t space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={PRE_CALL_TONE[setterClaim.preCallStatus] ?? "neutral"}>
                          Pre: {PRE_CALL_LABELS[setterClaim.preCallStatus]}
                        </StatusBadge>
                        <StatusBadge tone={POST_CALL_TONE[setterClaim.postCallStatus] ?? "neutral"}>
                          Post: {POST_CALL_LABELS[setterClaim.postCallStatus]}
                        </StatusBadge>
                        {setterClaim.clientName && setterClaim.clientName !== event.title && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <User className="h-3 w-3" />
                            {setterClaim.clientName}
                          </span>
                        )}
                        {setterClaim.clientEmail && (
                          <a
                            href={`mailto:${setterClaim.clientEmail}`}
                            className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground break-all"
                          >
                            <Mail className="h-3 w-3 shrink-0" />
                            {setterClaim.clientEmail}
                          </a>
                        )}
                      </div>
                      {setterClaim.notes && (() => {
                        // Approximate "long" detection — clamp shows ~3
                        // lines, so anything over ~180 chars almost
                        // certainly overflows. Letting the user toggle
                        // avoids the card dominating the screen with a
                        // long discovery-call brief.
                        const isLong = setterClaim.notes.length > 180;
                        const isOpen = expandedNotes.has(event.id);
                        return (
                          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <StickyNote className="h-3 w-3 mt-0.5 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p
                                className={cn(
                                  "whitespace-pre-wrap break-words",
                                  isLong && !isOpen && "line-clamp-3"
                                )}
                              >
                                {setterClaim.notes}
                              </p>
                              {isLong && (
                                <Button
                                  type="button"
                                  variant="link"
                                  size="xs"
                                  onClick={() => toggleNotesExpanded(event.id)}
                                  className="mt-1 h-auto px-0 py-1 sm:py-0"
                                >
                                  {isOpen ? "Show less" : "Show more"}
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Action row: Show / No-Show. Mobile gets full-width
                      50/50 buttons (h-10 ≈ 40px tap targets). Desktop
                      keeps the compact inline layout. Edit Deal slots in
                      on the same row (right-aligned on desktop, full-width
                      below on mobile). */}
                  {onAttendanceChange && (
                    <div className="mt-3 pt-3 border-t flex flex-col sm:flex-row sm:items-center gap-2">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          aria-pressed={eventAttendance === "showed"}
                          disabled={isSyncing}
                          onClick={() => handleAttendanceClick(event.id, "showed", eventAttendance === "showed" ? null : "showed")}
                          className={cn(
                            "h-10 sm:h-8 flex-1 sm:flex-none",
                            eventAttendance === "showed"
                              ? "border-foreground/20 bg-muted text-foreground dark:bg-muted"
                              : "text-muted-foreground"
                          )}
                        >
                          {pendingButton === "showed" ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className={cn("size-3.5", eventAttendance === "showed" && "text-emerald-500")} />
                          )}
                          Showed
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          aria-pressed={eventAttendance === "no_show"}
                          disabled={isSyncing}
                          onClick={() => handleAttendanceClick(event.id, "no_show", eventAttendance === "no_show" ? null : "no_show")}
                          className={cn(
                            "h-10 sm:h-8 flex-1 sm:flex-none",
                            eventAttendance === "no_show"
                              ? "border-foreground/20 bg-muted text-foreground dark:bg-muted"
                              : "text-muted-foreground"
                          )}
                        >
                          {pendingButton === "no_show" ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <XCircle className={cn("size-3.5", eventAttendance === "no_show" && "text-red-500")} />
                          )}
                          No Show
                        </Button>
                      </div>

                      {/* Edit button for linked deals */}
                      {isLinked && dealInfo && onEditDeal && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onEditDeal(dealInfo.dealId)}
                          className="h-10 sm:h-8 w-full sm:w-auto sm:ml-auto"
                        >
                          <Pencil className="size-3.5" />
                          Edit Deal
                        </Button>
                      )}
                    </div>
                  )}

                  {/* GHL sync indicator — only on events linked to a GHL appointment */}
                  {syncEntry && (() => {
                    const subId = isValidSubAccountId(syncEntry.subAccountId)
                      ? syncEntry.subAccountId
                      : null;
                    const sub = subId ? getSubAccount(subId) : null;
                    const SubBadge = sub ? (
                      <span
                        className={cn(
                          "inline-flex items-center justify-center rounded px-1 py-0 text-[9px] font-bold border",
                          sub.badgeClass
                        )}
                        title={sub.label}
                      >
                        {sub.shortLabel}
                      </span>
                    ) : null;
                    return (
                    <div className="mt-2 flex items-start gap-2">
                      {syncEntry.syncState === "out_of_sync" ? (
                        <div className="flex-1 rounded-2xl bg-muted/50 px-3 py-2.5">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                            <AlertTriangle className="size-3.5 text-amber-500" />
                            Out of sync with GHL
                            {SubBadge}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Dashboard: <span className="font-medium text-foreground">{dashboardStatusLabel(syncEntry.dashboardStatus)}</span>
                            <span className="mx-1.5">·</span>
                            GHL: <span className="font-medium text-foreground">{ghlStatusLabel(syncEntry.ghlStatus)}</span>
                          </div>
                          {onResync && (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Button
                                variant="outline"
                                size="xs"
                                disabled={pendingPushPull !== undefined}
                                onClick={() => handleResyncClick(event.id, "push")}
                                className="h-9 sm:h-7 flex-1 sm:flex-none"
                              >
                                {pendingPushPull === "push" ? (
                                  <Loader2 className="animate-spin" />
                                ) : (
                                  <RefreshCw />
                                )}
                                Push to GHL
                              </Button>
                              <Button
                                variant="outline"
                                size="xs"
                                disabled={pendingPushPull !== undefined}
                                onClick={() => handleResyncClick(event.id, "pull")}
                                className="h-9 sm:h-7 flex-1 sm:flex-none"
                              >
                                {pendingPushPull === "pull" ? (
                                  <Loader2 className="animate-spin" />
                                ) : (
                                  <RefreshCw className="rotate-180" />
                                )}
                                Pull from GHL
                              </Button>
                            </div>
                          )}
                        </div>
                      ) : syncEntry.syncState === "pending" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Loader2 className="size-3 animate-spin" />
                          Syncing with GHL…
                          {SubBadge}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <CheckCircle2 className="size-3 text-emerald-500" />
                          Synced with GHL
                          {SubBadge}
                        </span>
                      )}
                    </div>
                    );
                  })()}

                  {/* Admin: read-only attendance badge + closer reassign picker */}
                  {isAdmin && eventAttendance && (() => {
                    const currentCloser = attendanceCloserId?.[event.id] ?? null;
                    const canReassign =
                      Boolean(onReassignAttribution) &&
                      Boolean(closers && closers.length > 0) &&
                      Boolean(currentCloser);
                    const reassignBusy = pendingReassign.has(event.id);
                    // Mobile stacks the badge above the picker row so the
                    // layout is consistent across "Showed" (narrow) and
                    // "No Show" (wider) — otherwise the picker wraps below
                    // for No Show only and the cards look mismatched.
                    // Desktop stays inline.
                    return (
                      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center items-start gap-2 mt-3 pt-3 border-t">
                        <StatusBadge tone={eventAttendance === "showed" ? "success" : "danger"} className="shrink-0">
                          {eventAttendance === "showed" ? "Showed" : "No Show"}
                        </StatusBadge>
                        {canReassign && closers && (
                          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground w-full sm:w-auto">
                            <span className="shrink-0">Attributed to:</span>
                            <Select
                              value={currentCloser ?? ""}
                              disabled={reassignBusy}
                              onValueChange={(next) => {
                                if (!next || next === currentCloser) return;
                                handleReassignClick(event.id, next);
                              }}
                            >
                              <SelectTrigger
                                className={cn(
                                  "h-9 sm:h-8 min-w-0 flex-1 sm:flex-none sm:w-auto text-xs font-medium",
                                  reassignBusy && "opacity-60 cursor-wait"
                                )}
                                aria-label="Reassign attendance to a different closer"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {/* If the currently-attributed closer isn't in
                                    the active-closers list (deactivated since
                                    the row was written), still render them as
                                    the selected option so the picker reflects
                                    reality and the admin sees who to change FROM. */}
                                {currentCloser &&
                                  !closers.some((c) => c.id === currentCloser) && (
                                    <SelectItem value={currentCloser}>
                                      (unknown / inactive)
                                    </SelectItem>
                                  )}
                                {closers.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.displayName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {reassignBusy && (
                              <Loader2 className="size-3 animate-spin text-muted-foreground" />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  </Card>
                </div>
              );
            })}
          </div>
        </section>
        );
      })}
    </div>
  );
}
