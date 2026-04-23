"use client";

import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Clock, Mail, PhoneIncoming, User } from "lucide-react";
import type { SetterFollowUp } from "@/lib/setterStats";

interface Props {
  followUps: SetterFollowUp[];
}

function formatWhen(iso: string | null): string {
  if (!iso) return "Time TBD";
  try {
    return format(parseISO(iso), "MMM d, h:mm a");
  } catch {
    return iso;
  }
}

export function SetterFollowUpList({ followUps }: Props) {
  if (followUps.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/50 bg-card/50 p-10 text-center">
        <p className="text-sm text-muted-foreground">
          No follow-ups needed. When you tag an appointment as <span className="font-medium text-foreground">Needs follow-up</span>, it shows up here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {followUps.map((f) => (
        <div
          key={f.appointmentId}
          className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-amber-500/15 text-amber-700 dark:text-amber-400">
                  <PhoneIncoming className="h-3 w-3" />
                  Needs follow-up
                </span>
                {f.clientName && (
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-foreground">
                    <User className="h-3 w-3 text-muted-foreground" />
                    {f.clientName}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatWhen(f.scheduledAt)}
                </span>
                {f.clientEmail && (
                  <a
                    href={`mailto:${f.clientEmail}`}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    <Mail className="h-3 w-3" />
                    {f.clientEmail}
                  </a>
                )}
              </div>
              {f.notes && (
                <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                  {f.notes}
                </p>
              )}
            </div>
            <Link
              href="/closer/setter/appointments"
              className="shrink-0 inline-flex items-center h-8 px-3 rounded-lg border border-border/50 bg-background text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              Open
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
