"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import {
  AlignLeft,
  CheckCircle2,
  ChevronDown,
  Clock,
  Mail,
  MapPin,
  Pencil,
  PhoneCall,
  PhoneOff,
  StickyNote,
  User,
  UserCircle2,
  Users,
  Video,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PRE_CALL_BADGE,
  PRE_CALL_LABELS,
  POST_CALL_BADGE,
  POST_CALL_LABELS,
  type PreCallStatus,
  type PostCallStatus,
} from "@/lib/appointments";
import type { NoShowFollowUp } from "@/lib/eventAttendance";

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
const RESPONSE_BADGE: Record<string, { label: string; cls: string }> = {
  accepted: { label: "Accepted", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  declined: { label: "Declined", cls: "bg-red-500/15 text-red-700 dark:text-red-400" },
  tentative: { label: "Maybe", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  needsAction: { label: "Pending", cls: "bg-muted/60 text-muted-foreground" },
};

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  tentative: { label: "Tentative", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  cancelled: { label: "Cancelled", cls: "bg-red-500/15 text-red-700 dark:text-red-400" },
};

export function NoShowFollowUpList({
  items,
  variant,
  tone = "active",
  onEdit,
  emptyText,
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
      <div className="rounded-xl border border-dashed border-border/50 bg-card/50 p-10 text-center">
        <p className="text-sm text-muted-foreground">
          {emptyText ?? "No no-shows to follow up on. Nice."}
        </p>
      </div>
    );
  }

  const cardBorder =
    tone === "recovered" || tone === "showed"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : "border-red-500/30 bg-red-500/5";

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
          <div
            key={`${n.googleEventId}-${n.markedAt}`}
            className={cn("rounded-xl border p-4", cardBorder)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {/* Title row: status pill + client name + event status */}
                <div className="flex items-center gap-2 flex-wrap">
                  {tone === "recovered" || tone === "showed" ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" />
                      {tone === "recovered" ? "Recovered" : "Showed"}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-red-500/15 text-red-700 dark:text-red-400">
                      <XCircle className="h-3 w-3" />
                      No show
                    </span>
                  )}
                  {n.clientName && (
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-foreground">
                      <User className="h-3 w-3 text-muted-foreground" />
                      {n.clientName}
                    </span>
                  )}
                  {statusPill && (
                    <span className={cn(
                      "shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium",
                      statusPill.cls
                    )}>
                      {statusPill.label}
                    </span>
                  )}
                </div>

                {/* Meta row: scheduled time range, email, links, attribution */}
                <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatRange(n.scheduledAt, n.eventEnd, n.allDay)}
                  </span>
                  {n.clientEmail && (
                    <a
                      href={`mailto:${n.clientEmail}`}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      <Mail className="h-3 w-3" />
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
                      <Video className="h-3 w-3" />
                      Meet
                    </a>
                  )}
                  {n.eventLocation && (
                    <span className="inline-flex items-center gap-1 max-w-[14rem] truncate" title={n.eventLocation}>
                      <MapPin className="h-3 w-3 shrink-0" />
                      {n.eventLocation}
                    </span>
                  )}
                  {n.calendarName && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted text-[10px] font-medium">
                      {n.calendarName}
                    </span>
                  )}
                  {variant === "setter" && n.markedByCloserName && (
                    <span className="inline-flex items-center gap-1">
                      <UserCircle2 className="h-3 w-3" />
                      Marked by {n.markedByCloserName}
                    </span>
                  )}
                  {n.attendees.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {n.attendees.length} attendee{n.attendees.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {/* Details expander — description + attendees, identical to calendar pattern */}
                {hasDetails && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(n.googleEventId)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronDown className={cn("h-3 w-3 transition-transform", isOpen && "rotate-180")} />
                      {isOpen ? "Hide details" : "Details"}
                    </button>
                    {isOpen && (
                      <div className="mt-2 space-y-2.5 rounded-lg border border-border/40 bg-muted/20 p-3">
                        {n.eventDescription && (
                          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <AlignLeft className="h-3 w-3 mt-0.5 shrink-0" />
                            <p className="whitespace-pre-wrap break-words">{n.eventDescription}</p>
                          </div>
                        )}
                        {n.attendees.length > 0 && (
                          <div className="flex items-start gap-1.5 text-xs">
                            <Users className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
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
                )}

                {/* Setter claim panel — same layout as CalendarEventList so a
                    follow-up card and a calendar row read the same when a
                    setter prepped the lead. Gated on hasAppointment because
                    the appointment row is what makes a setter "exist on the
                    call" (setterName comes from the same join). */}
                {hasAppointment && (
                  <div className="mt-3 pt-3 border-t border-border/30 dark:border-white/[0.04] space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {n.setterName && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <UserCircle2 className="h-3 w-3" />
                          Setter: {n.setterName}
                        </span>
                      )}
                      {preCall && (
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold",
                          PRE_CALL_BADGE[preCall]
                        )}>
                          <PhoneCall className="h-3 w-3" />
                          Pre: {PRE_CALL_LABELS[preCall]}
                        </span>
                      )}
                      {postCall && (
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold",
                          POST_CALL_BADGE[postCall]
                        )}>
                          <PhoneOff className="h-3 w-3" />
                          Post: {POST_CALL_LABELS[postCall]}
                        </span>
                      )}
                    </div>
                    {n.setterNotes && (
                      <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <StickyNote className="h-3 w-3 mt-0.5 shrink-0" />
                        <p className="whitespace-pre-wrap break-words">{n.setterNotes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Setter-only: edit button */}
              {variant === "setter" && onEdit && (
                <button
                  onClick={() => onEdit(n)}
                  className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border/50 bg-background text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  <Pencil className="h-3 w-3" />
                  {hasAppointment ? "Update" : "Start follow-up"}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
