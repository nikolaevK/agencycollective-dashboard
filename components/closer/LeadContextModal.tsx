"use client";

import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  AlignLeft,
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  ExternalLink,
  FileText,
  Mail,
  MapPin,
  PhoneCall,
  PhoneOff,
  StickyNote,
  User,
  UserCircle2,
  Users,
  Video,
  X,
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
import type { CalendarEvent, AttendeeResponseStatus } from "@/components/closer/CalendarEventList";
import { formatCents } from "@/components/closers/types";
import { DealInvoiceStatusBadge } from "@/components/closers/DealInvoiceStatusBadge";
import { DealContractStatusBadge } from "@/components/closers/DealContractStatusBadge";

interface Appointment {
  id: string;
  setterId: string;
  setterName: string | null;
  clientName: string | null;
  clientEmail: string | null;
  scheduledAt: string | null;
  preCallStatus: string;
  postCallStatus: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Deal {
  id: string;
  closerId: string;
  closerName: string | null;
  setterId: string | null;
  setterName: string | null;
  clientName: string;
  clientEmail: string | null;
  dealValue: number;
  status: string;
  paidStatus: string;
  closingDate: string | null;
  serviceCategory: string | null;
  industry: string | null;
  brandName: string | null;
  website: string | null;
  notes: string | null;
  googleEventId: string | null;
  createdAt: string;
  updatedAt: string;
  invoiceStatus: string | null;
  invoiceNumber: string | null;
  contractStatus: string | null;
}

interface Attendance {
  closerId: string;
  closerName: string | null;
  showStatus: string;
  createdAt: string;
  updatedAt: string;
}

interface LeadContext {
  googleEventId: string | null;
  event: CalendarEvent | null;
  appointments: Appointment[];
  deals: Deal[];
  attendance: Attendance[];
}

interface Props {
  googleEventId: string | null;
  dealId: string | null;
  fallbackTitle: string;
  onClose: () => void;
}

const DEAL_STATUS_STYLES: Record<string, string> = {
  closed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  not_closed: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  pending_signature: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  rescheduled: "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
  follow_up: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
};

const RESPONSE_BADGE: Record<AttendeeResponseStatus, { label: string; cls: string }> = {
  accepted: { label: "Accepted", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  declined: { label: "Declined", cls: "bg-red-500/15 text-red-700 dark:text-red-400" },
  tentative: { label: "Maybe", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  needsAction: { label: "Pending", cls: "bg-muted/60 text-muted-foreground" },
};

function formatWhen(iso: string | null | undefined, withTime = true): string {
  if (!iso) return "—";
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      const [y, m, d] = iso.split("-").map(Number);
      return format(new Date(y, m - 1, d), "MMM d, yyyy");
    }
    return format(parseISO(iso), withTime ? "MMM d, yyyy · h:mm a" : "MMM d, yyyy");
  } catch {
    return iso;
  }
}

export function LeadContextModal({ googleEventId, dealId, fallbackTitle, onClose }: Props) {
  const key = `${googleEventId ?? ""}|${dealId ?? ""}`;

  const { data, isLoading } = useQuery<LeadContext>({
    queryKey: ["lead-context", key],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (googleEventId) params.set("googleEventId", googleEventId);
      if (dealId) params.set("dealId", dealId);
      const res = await fetch(`/api/closer/notes/lead-context?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load lead context");
      const json = await res.json();
      return json.data;
    },
    staleTime: 30_000,
  });

  const ctx = data;
  const event = ctx?.event;
  const appointments = ctx?.appointments ?? [];
  const deals = ctx?.deals ?? [];
  const attendance = ctx?.attendance ?? [];

  const headingTitle = event?.title ?? deals[0]?.clientName ?? appointments[0]?.clientName ?? fallbackTitle;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl mx-4 rounded-2xl border border-border bg-card shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-6 py-4 rounded-t-2xl">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-foreground truncate">{headingTitle}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Full lead history across calendar, appointments, deals, and attendance.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 rounded-xl bg-muted/50 animate-pulse" />
              ))}
            </div>
          )}

          {!isLoading && ctx && (
            <>
              {/* ── Calendar event ─────────────────────────────────────── */}
              <Section icon={Calendar} title="Calendar event" empty={!event ? "Event not found in calendar window." : null}>
                {event && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatWhen(event.start)}
                        {event.end && ` – ${formatWhen(event.end)}`}
                      </span>
                      {event.calendarName && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted text-[10px] font-medium">
                          {event.calendarName}
                        </span>
                      )}
                      {event.meetLink && (
                        <a
                          href={event.meetLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <Video className="h-3 w-3" />
                          Meet
                        </a>
                      )}
                      {event.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {event.location}
                        </span>
                      )}
                    </div>
                    {event.attendees.length > 0 && (
                      <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
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
                      </div>
                    )}
                    {event.description && (
                      <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
                        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <AlignLeft className="h-3 w-3 mt-0.5 shrink-0" />
                          <p className="whitespace-pre-wrap break-words">{event.description}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Section>

              {/* ── Setter appointments ────────────────────────────────── */}
              <Section icon={PhoneCall} title={`Setter claims (${appointments.length})`} empty={appointments.length === 0 ? "No setter has claimed this event." : null}>
                <div className="space-y-3">
                  {appointments.map((a) => (
                    <div key={a.id} className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {a.setterName && (
                          <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground">
                            <UserCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                            {a.setterName}
                          </span>
                        )}
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold",
                          PRE_CALL_BADGE[a.preCallStatus as PreCallStatus] ?? "bg-muted text-muted-foreground"
                        )}>
                          <PhoneCall className="h-3 w-3" />
                          Pre: {PRE_CALL_LABELS[a.preCallStatus as PreCallStatus] ?? a.preCallStatus}
                        </span>
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold",
                          POST_CALL_BADGE[a.postCallStatus as PostCallStatus] ?? "bg-muted text-muted-foreground"
                        )}>
                          <PhoneOff className="h-3 w-3" />
                          Post: {POST_CALL_LABELS[a.postCallStatus as PostCallStatus] ?? a.postCallStatus}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {a.clientName && (
                          <span className="inline-flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {a.clientName}
                          </span>
                        )}
                        {a.clientEmail && (
                          <a
                            href={`mailto:${a.clientEmail}`}
                            className="inline-flex items-center gap-1 hover:text-foreground"
                          >
                            <Mail className="h-3 w-3" />
                            {a.clientEmail}
                          </a>
                        )}
                        {a.scheduledAt && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatWhen(a.scheduledAt)}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 opacity-70">
                          Updated {formatWhen(a.updatedAt)}
                        </span>
                      </div>
                      {a.notes && (
                        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <StickyNote className="h-3 w-3 mt-0.5 shrink-0" />
                          <p className="whitespace-pre-wrap break-words">{a.notes}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Section>

              {/* ── Deals ─────────────────────────────────────────────── */}
              <Section icon={Briefcase} title={`Deals (${deals.length})`} empty={deals.length === 0 ? "No deal linked yet." : null}>
                <div className="space-y-3">
                  {deals.map((d) => (
                    <div key={d.id} className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{d.clientName}</span>
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide",
                          DEAL_STATUS_STYLES[d.status] ?? DEAL_STATUS_STYLES.follow_up
                        )}>
                          {d.status.replace(/_/g, " ")}
                        </span>
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide",
                          d.paidStatus === "paid"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                            : "bg-muted/60 text-muted-foreground"
                        )}>
                          {d.paidStatus}
                        </span>
                        {d.invoiceStatus && <DealInvoiceStatusBadge status={d.invoiceStatus} />}
                        {d.contractStatus && <DealContractStatusBadge status={d.contractStatus} />}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {d.dealValue > 0 && (
                          <span className="inline-flex items-center gap-1 font-medium text-foreground">
                            <DollarSign className="h-3 w-3" />
                            {formatCents(d.dealValue)}
                          </span>
                        )}
                        {d.closerName && (
                          <span className="inline-flex items-center gap-1">
                            <UserCircle2 className="h-3 w-3" />
                            Closed by {d.closerName}
                          </span>
                        )}
                        {d.setterName && (
                          <span className="inline-flex items-center gap-1">
                            <UserCircle2 className="h-3 w-3" />
                            Set by {d.setterName}
                          </span>
                        )}
                        {d.clientEmail && (
                          <a
                            href={`mailto:${d.clientEmail}`}
                            className="inline-flex items-center gap-1 hover:text-foreground"
                          >
                            <Mail className="h-3 w-3" />
                            {d.clientEmail}
                          </a>
                        )}
                        {d.website && (
                          <a
                            href={d.website.startsWith("http") ? d.website : `https://${d.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {d.website.replace(/^https?:\/\//, "")}
                          </a>
                        )}
                        {d.closingDate && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Closing {formatWhen(d.closingDate, false)}
                          </span>
                        )}
                      </div>
                      {(d.serviceCategory || d.industry || d.brandName) && (
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          {d.brandName && <span className="inline-flex items-center gap-1">Brand: {d.brandName}</span>}
                          {d.industry && <span className="inline-flex items-center gap-1">Industry: {d.industry}</span>}
                          {d.serviceCategory && <span className="inline-flex items-center gap-1 truncate max-w-[24rem]">Service: {d.serviceCategory}</span>}
                        </div>
                      )}
                      {d.invoiceNumber && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <FileText className="h-3 w-3" />
                          Invoice {d.invoiceNumber}
                        </div>
                      )}
                      {d.notes && (
                        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <StickyNote className="h-3 w-3 mt-0.5 shrink-0" />
                          <p className="whitespace-pre-wrap break-words">{d.notes}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Section>

              {/* ── Attendance ────────────────────────────────────────── */}
              <Section icon={CheckCircle2} title={`Attendance (${attendance.length})`} empty={attendance.length === 0 ? "No show/no-show marks yet." : null}>
                <div className="space-y-2">
                  {attendance.map((a) => (
                    <div key={`${a.closerId}-${a.updatedAt}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/40 bg-muted/10 p-3">
                      <span className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide",
                        a.showStatus === "showed"
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : "bg-red-500/15 text-red-700 dark:text-red-400"
                      )}>
                        {a.showStatus === "showed" ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        {a.showStatus === "showed" ? "Showed" : "No show"}
                      </span>
                      {a.closerName && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <UserCircle2 className="h-3 w-3" />
                          Marked by {a.closerName}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground opacity-70">
                        {formatWhen(a.updatedAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  empty,
  children,
}: {
  icon: React.ElementType;
  title: string;
  empty: string | null;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</h4>
      </div>
      {empty ? <p className="text-xs text-muted-foreground italic">{empty}</p> : children}
    </section>
  );
}
