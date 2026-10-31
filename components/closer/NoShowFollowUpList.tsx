"use client";

import { useState } from "react";
import { GhlEventChip, type GhlCrossReferenceData } from "@/components/ghl/GhlEventChip";
import { format, parseISO } from "date-fns";
import {
  AlignLeft,
  ChevronDown,
  Clock,
  Mail,
  MapPin,
  Pencil,
  StickyNote,
  User,
  UserCircle2,
  Users,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PRE_CALL_LABELS,
  POST_CALL_LABELS,
  type PreCallStatus,
  type PostCallStatus,
} from "@/lib/appointments";
import type { NoShowFollowUp } from "@/lib/eventAttendance";
import { Badge, StatusBadge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export interface NoShowFollowUpListProps {
  items: NoShowFollowUp[];
  /**
   * When shown to setters, each row is a team-wide no-show and we surface
   * both the closer who marked it AND the setter who prepped it. On closer
   * dashboards, the closer attribution is redundant (it's always them).
   */
  variant: "setter" | "closer";
  /** Visual accent: red for active no-shows, emerald for recoveries/showed. */
  tone?: "active" | "recovered" | "showed";
  /** Setter handler to open the status editor. Closer variant ignores this. */
  onEdit?: (item: NoShowFollowUp) => void;
  /** What to render when the list is empty. */
  emptyText?: string;
  /**
   * Pre-fetched GHL cross-reference data. Pass this from a parent that
   * holds the full (unpaginated) items list so pagination / search /
   * sort don't trigger a new cross-reference fetch on every change.
   * Without it, each render with a different `items` slice refires the
   * query — that's what caused 130+ /api/ghl/cross-reference calls per
   * session on the dashboards.
   */
  ghlData?: GhlCrossReferenceData;
}

function formatRange(start: string | null, end: string | null, allDay: boolean): string {
  if (!start) return "Time unknown";
  try {
    if (allDay || /^\d{4}-\d{2}-\d{2}$/.test(start)) {
      const [y, m, d] = start.split("-").map(Number);
      return `${format(new Date(y, m - 1, d), "MMM d, yyyy")} (all day)`;
    }
    const startDate = parseISO(start);
    if (!end) return format(startDate, "MMM d, h:mm a");
    const endDate = parseISO(end);
    const sameDay = format(startDate, "yyyy-MM-dd") === format(endDate, "yyyy-MM-dd");
    return sameDay
      ? `${format(startDate, "MMM d, h:mm a")} – ${format(endDate, "h:mm a")}`
      : `${format(startDate, "MMM d, h:mm a")} – ${format(endDate, "MMM d, h:mm a")}`;
  } catch {
    return start;
  }
}

// Mirrors components/closer/CalendarEventList — keeps the two surfaces
// visually consistent so a "Cancelled" pill on a follow-up card reads the
// same as on the calendar.
// `tone` is the status color of the Badge pattern.
const RESPONSE_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  accepted: { label: "Accepted", tone: "success" },
  declined: { label: "Declined", tone: "danger" },
  tentative: { label: "Maybe", tone: "warning" },
  needsAction: { label: "Pending", tone: "neutral" },
};

const STATUS_PILL: Record<string, { label: string; tone: BadgeTone }> = {
  tentative: { label: "Tentative", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

// Status tones for the setter's pre/post-call badges (same hues as the
// lib/appointments PRE_CALL_BADGE / POST_CALL_BADGE fills).
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

export function NoShowFollowUpList({
  items,
  variant,
  tone = "active",
  onEdit,
  emptyText,
  ghlData,
}: NoShowFollowUpListProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpanded(eventId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 md:p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {emptyText ?? "No no-shows to follow up on. Nice."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((n) => {
        const preCall = n.preCallStatus as PreCallStatus | null;
        const postCall = n.postCallStatus as PostCallStatus | null;
        const hasAppointment = n.appointmentId != null;
        const statusPill = n.eventStatus ? STATUS_PILL[n.eventStatus] : null;
        const hasDetails = Boolean(n.eventDescription) || n.attendees.length > 0;
        const isOpen = expanded.has(n.googleEventId);

        return (
          <Card key={`${n.googleEventId}-${n.markedAt}`}>
            <CardContent className="flex items-start justify-between gap-3 p-4 md:p-4">
              <div className="min-w-0 flex-1">
                {/* Title row: status pill + client name + event status */}
                <div className="flex items-center gap-2 flex-wrap">
                  {tone === "recovered" || tone === "showed" ? (
                    <StatusBadge tone="success">
                      {tone === "recovered" ? "Recovered" : "Showed"}
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="danger">No show</StatusBadge>
                  )}
                  {n.clientName && (
                    <span className="inline-flex items-center gap-1 text-sm font-medium">
                      <User className="size-3 text-muted-foreground" />
                      {n.clientName}
                    </span>
                  )}
                  {statusPill && (
                    <StatusBadge tone={statusPill.tone}>{statusPill.label}</StatusBadge>
                  )}
                </div>

                {/* Meta row: scheduled time range, email, links, attribution */}
                <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3" />
                    {formatRange(n.scheduledAt, n.eventEnd, n.allDay)}
                  </span>
                  {n.clientEmail && (
                    <a
                      href={`mailto:${n.clientEmail}`}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      <Mail className="size-3" />
                      {n.clientEmail}
                    </a>
                  )}
                  {n.meetLink && (
                    <a
                      href={n.meetLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      <Video className="size-3" />
                      Meet
                    </a>
                  )}
                  {n.eventLocation && (
                    <span className="inline-flex items-center gap-1 max-w-[14rem] truncate" title={n.eventLocation}>
                      <MapPin className="size-3 shrink-0" />
                      {n.eventLocation}
                    </span>
                  )}
                  {n.calendarName && (
                    <Badge variant="secondary">{n.calendarName}</Badge>
                  )}
                  {variant === "setter" && n.markedByCloserName && (
                    <span className="inline-flex items-center gap-1">
                      <UserCircle2 className="size-3" />
                      Marked by {n.markedByCloserName}
                    </span>
                  )}
                  {n.attendees.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3" />
                      {n.attendees.length} attendee{n.attendees.length !== 1 ? "s" : ""}
                    </span>
                  )}
                  <GhlEventChip
                    event={
                      n.googleEventId && n.scheduledAt
                        ? {
                            id: n.googleEventId,
                            title: n.eventTitle ?? n.clientName ?? "",
                            startTime: n.scheduledAt,
                            endTime: n.eventEnd ?? "",
                          }
                        : null
                    }
                    data={ghlData}
                  />
                </div>

                {/* Details expander — description + attendees, identical to calendar pattern */}
                {hasDetails && (
                  <div className="mt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => toggleExpanded(n.googleEventId)}
                      className="-ml-2 text-muted-foreground"
                    >
                      <ChevronDown className={cn("transition-transform", isOpen && "rotate-180")} />
                      {isOpen ? "Hide details" : "Details"}
                    </Button>
                    {isOpen && (
                      <div className="mt-2 space-y-2.5 rounded-2xl bg-muted/50 p-3">
                        {n.eventDescription && (
                          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <AlignLeft className="size-3 mt-0.5 shrink-0" />
                            <p className="whitespace-pre-wrap break-words">{n.eventDescription}</p>
                          </div>
                        )}
                        {n.attendees.length > 0 && (
                          <div className="flex items-start gap-1.5 text-xs">
                            <Users className="size-3 mt-0.5 shrink-0 text-muted-foreground" />
                            <ul className="space-y-1 flex-1 min-w-0">
                              {n.attendees.map((a) => (
                                <li key={a.email} className="flex items-center gap-2 flex-wrap">
                                  <a
                                    href={`mailto:${a.email}`}
                                    className="text-muted-foreground hover:text-foreground truncate"
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
                )}

                {/* Setter claim panel — same layout as CalendarEventList so a
                    follow-up card and a calendar row read the same when a
                    setter prepped the lead. Gated on hasAppointment because
                    the appointment row is what makes a setter "exist on the
                    call" (setterName comes from the same join). */}
                {hasAppointment && (
                  <div className="mt-3 pt-3 border-t space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {n.setterName && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <UserCircle2 className="size-3" />
                          Setter: {n.setterName}
                        </span>
                      )}
                      {preCall && (
                        <StatusBadge tone={PRE_CALL_TONE[preCall]}>
                          Pre: {PRE_CALL_LABELS[preCall]}
                        </StatusBadge>
                      )}
                      {postCall && (
                        <StatusBadge tone={POST_CALL_TONE[postCall]}>
                          Post: {POST_CALL_LABELS[postCall]}
                        </StatusBadge>
                      )}
                    </div>
                    {n.setterNotes && (
                      <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <StickyNote className="size-3 mt-0.5 shrink-0" />
                        <p className="whitespace-pre-wrap break-words">{n.setterNotes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Setter-only: edit button */}
              {variant === "setter" && onEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(n)}
                  className="shrink-0"
                >
                  <Pencil />
                  {hasAppointment ? "Update" : "Start follow-up"}
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
