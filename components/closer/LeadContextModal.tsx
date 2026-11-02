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
  StickyNote,
  User,
  UserCircle2,
  Users,
  Video,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DealStatusBadge } from "@/components/closers/DealStatusBadge";
import {
  PRE_CALL_LABELS,
  POST_CALL_LABELS,
  type PreCallStatus,
  type PostCallStatus,
} from "@/lib/appointmentRules";
import type { CalendarEvent } from "@/components/closer/CalendarEventList";
import { formatCents } from "@/components/closers/types";
import { DealInvoiceStatusBadge } from "@/components/closers/DealInvoiceStatusBadge";
import { DealContractStatusBadge } from "@/components/closers/DealContractStatusBadge";
import { getSubAccount, isValidSubAccountId } from "@/lib/ghl/subAccounts";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dialogOverlayClass, dialogPanelClass } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ATTENDEE_RESPONSE_META, POST_CALL_TONE, PRE_CALL_TONE } from "@/components/closer/calendarState";

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

interface GhlLink {
  subAccountId: string;
  ghlContactId: string | null;
  ghlAppointmentId: string;
}

interface LeadContext {
  googleEventId: string | null;
  event: CalendarEvent | null;
  /** GHL link metadata when this lead is cross-referenced to a GHL
   *  appointment. Drives the small "GHL: <sub-account>" badge in the
   *  event header. Null for non-GHL events. */
  ghlLink: GhlLink | null;
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

/** Inner record tile (one claim / deal / attendance mark). */
const TILE = "rounded-2xl bg-muted/40 p-3";

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className={dialogOverlayClass} onClick={onClose} />
      <div className={cn(dialogPanelClass, "relative z-50 w-full max-w-3xl mx-4 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain")}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-popover px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h3 className="text-base font-medium truncate">{headingTitle}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Full lead history across calendar, appointments, deals, and attendance.
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} className="-mr-2 shrink-0">
            <span className="sr-only">Close</span>
            <X />
          </Button>
        </div>

        <div className="p-4 space-y-6 sm:p-6">
          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24" />
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
                        <Clock className="size-3" />
                        {formatWhen(event.start)}
                        {event.end && ` – ${formatWhen(event.end)}`}
                      </span>
                      {event.calendarName && (
                        <Badge variant="secondary" className="max-w-full">
                          <span className="truncate">{event.calendarName}</span>
                        </Badge>
                      )}
                      {ctx?.ghlLink && isValidSubAccountId(ctx.ghlLink.subAccountId) && (() => {
                        const sub = getSubAccount(ctx.ghlLink.subAccountId);
                        return (
                          <Badge
                            variant="outline"
                            className={cn("gap-1 font-medium", sub.badgeClass)}
                            title={`Linked to GHL · ${sub.label}`}
                          >
                            <span className="font-semibold">{sub.shortLabel}</span>
                            GHL · {sub.label}
                          </Badge>
                        );
                      })()}
                      {event.meetLink && (
                        <a
                          href={event.meetLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <Video className="size-3" />
                          Meet
                        </a>
                      )}
                      {event.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3 shrink-0" />
                          {event.location}
                        </span>
                      )}
                    </div>
                    {event.attendees.length > 0 && (
                      <div className={TILE}>
                        <div className="flex items-start gap-1.5 text-xs">
                          <Users className="size-3 mt-0.5 shrink-0 text-muted-foreground" />
                          <ul className="space-y-1 flex-1 min-w-0">
                            {event.attendees.map((a) => (
                              <li key={a.email} className="flex items-center gap-2 flex-wrap">
                                <a
                                  href={`mailto:${a.email}`}
                                  className="min-w-0 max-w-full text-muted-foreground hover:text-foreground truncate"
                                >
                                  {a.displayName ? `${a.displayName} <${a.email}>` : a.email}
                                </a>
                                {a.responseStatus && ATTENDEE_RESPONSE_META[a.responseStatus] && (
                                  <StatusBadge tone={ATTENDEE_RESPONSE_META[a.responseStatus].tone}>
                                    {ATTENDEE_RESPONSE_META[a.responseStatus].label}
                                  </StatusBadge>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                    {event.description && (
                      <div className={TILE}>
                        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <AlignLeft className="size-3 mt-0.5 shrink-0" />
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
                    <div key={a.id} className={cn(TILE, "space-y-2")}>
                      <div className="flex flex-wrap items-center gap-2">
                        {a.setterName && (
                          <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground">
                            <UserCircle2 className="size-3.5 text-muted-foreground" />
                            {a.setterName}
                          </span>
                        )}
                        <StatusBadge tone={PRE_CALL_TONE[a.preCallStatus as PreCallStatus] ?? "neutral"}>
                          Pre: {PRE_CALL_LABELS[a.preCallStatus as PreCallStatus] ?? a.preCallStatus}
                        </StatusBadge>
                        <StatusBadge tone={POST_CALL_TONE[a.postCallStatus as PostCallStatus] ?? "neutral"}>
                          Post: {POST_CALL_LABELS[a.postCallStatus as PostCallStatus] ?? a.postCallStatus}
                        </StatusBadge>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {a.clientName && (
                          <span className="inline-flex items-center gap-1">
                            <User className="size-3" />
                            {a.clientName}
                          </span>
                        )}
                        {a.clientEmail && (
                          <a
                            href={`mailto:${a.clientEmail}`}
                            className="inline-flex items-center gap-1 hover:text-foreground"
                          >
                            <Mail className="size-3" />
                            {a.clientEmail}
                          </a>
                        )}
                        {a.scheduledAt && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="size-3" />
                            {formatWhen(a.scheduledAt)}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 opacity-70">
                          Updated {formatWhen(a.updatedAt)}
                        </span>
                      </div>
                      {a.notes && (
                        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <StickyNote className="size-3 mt-0.5 shrink-0" />
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
                    <div key={d.id} className={cn(TILE, "space-y-2")}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 text-sm font-medium text-foreground [overflow-wrap:anywhere]">{d.clientName}</span>
                        <DealStatusBadge status={d.status} />
                        <StatusBadge tone={d.paidStatus === "paid" ? "success" : "neutral"} className="capitalize">
                          {d.paidStatus}
                        </StatusBadge>
                        {d.invoiceStatus && <DealInvoiceStatusBadge status={d.invoiceStatus} />}
                        {d.contractStatus && <DealContractStatusBadge status={d.contractStatus} />}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {d.dealValue > 0 && (
                          <span className="inline-flex items-center gap-1 font-medium tabular-nums text-foreground">
                            <DollarSign className="size-3" />
                            {formatCents(d.dealValue)}
                          </span>
                        )}
                        {d.closerName && (
                          <span className="inline-flex items-center gap-1">
                            <UserCircle2 className="size-3" />
                            Closed by {d.closerName}
                          </span>
                        )}
                        {d.setterName && (
                          <span className="inline-flex items-center gap-1">
                            <UserCircle2 className="size-3" />
                            Set by {d.setterName}
                          </span>
                        )}
                        {d.clientEmail && (
                          <a
                            href={`mailto:${d.clientEmail}`}
                            className="inline-flex items-center gap-1 hover:text-foreground"
                          >
                            <Mail className="size-3" />
                            {d.clientEmail}
                          </a>
                        )}
                        {d.website && (
                          <a
                            href={d.website.startsWith("http") ? d.website : `https://${d.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-w-0 max-w-full items-center gap-1 text-primary hover:underline"
                          >
                            <ExternalLink className="size-3 shrink-0" />
                            <span className="truncate">{d.website.replace(/^https?:\/\//, "")}</span>
                          </a>
                        )}
                        {d.closingDate && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="size-3" />
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
                          <FileText className="size-3" />
                          Invoice {d.invoiceNumber}
                        </div>
                      )}
                      {d.notes && (
                        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <StickyNote className="size-3 mt-0.5 shrink-0" />
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
                    <div key={`${a.closerId}-${a.updatedAt}`} className={cn(TILE, "flex flex-wrap items-center gap-2")}>
                      <StatusBadge tone={a.showStatus === "showed" ? "success" : "danger"}>
                        {a.showStatus === "showed" ? "Showed" : "No show"}
                      </StatusBadge>
                      {a.closerName && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <UserCircle2 className="size-3" />
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
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <h4 className="text-sm font-medium">{title}</h4>
      </div>
      {empty ? <p className="text-xs text-muted-foreground italic">{empty}</p> : children}
    </section>
  );
}
