"use client";

import { format, parseISO } from "date-fns";
import {
  CheckCircle2,
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

interface Props {
  items: NoShowFollowUp[];
  /**
   * When shown to setters, each row is a team-wide no-show and we surface
   * both the closer who marked it AND the setter who prepped it. On closer
   * dashboards, the closer attribution is redundant (it's always them).
   */
  variant: "setter" | "closer";
  /** Visual accent: red for active no-shows, emerald for recoveries. */
  tone?: "active" | "recovered";
  /** Setter handler to open the status editor. Closer variant ignores this. */
  onEdit?: (item: NoShowFollowUp) => void;
  /** What to render when the list is empty. */
  emptyText?: string;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "Time unknown";
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      const [y, m, d] = iso.split("-").map(Number);
      return format(new Date(y, m - 1, d), "MMM d, yyyy");
    }
    return format(parseISO(iso), "MMM d, h:mm a");
  } catch {
    return iso;
  }
}

export function NoShowFollowUpList({
  items,
  variant,
  tone = "active",
  onEdit,
  emptyText,
}: Props) {
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
    tone === "recovered"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : "border-red-500/30 bg-red-500/5";

  return (
    <div className="space-y-2">
      {items.map((n) => {
        const preCall = n.preCallStatus as PreCallStatus | null;
        const postCall = n.postCallStatus as PostCallStatus | null;
        const hasAppointment = n.appointmentId != null;

        return (
          <div
            key={`${n.googleEventId}-${n.markedAt}`}
            className={cn("rounded-xl border p-4", cardBorder)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {/* Title row: status pill + client name */}
                <div className="flex items-center gap-2 flex-wrap">
                  {tone === "recovered" ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" />
                      Recovered
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
                </div>

                {/* Meta row: scheduled time, email, marked by, setter */}
                <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatWhen(n.scheduledAt)}
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
                  {n.setterName && (
                    <span className="inline-flex items-center gap-1">
                      <UserCircle2 className="h-3 w-3" />
                      Setter: {n.setterName}
                    </span>
                  )}
                  {n.attendeeEmails.length > 1 && (
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {n.attendeeEmails.length} attendees
                    </span>
                  )}
                </div>

                {/* Status pills row (same labels/colors as the main calendar) */}
                {hasAppointment && (preCall || postCall) && (
                  <div className="flex flex-wrap items-center gap-2 mt-2.5">
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
                )}

                {/* Setter notes */}
                {n.setterNotes && (
                  <div className="flex items-start gap-1.5 mt-2 text-xs text-muted-foreground">
                    <StickyNote className="h-3 w-3 mt-0.5 shrink-0" />
                    <span className="whitespace-pre-wrap break-words">{n.setterNotes}</span>
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
