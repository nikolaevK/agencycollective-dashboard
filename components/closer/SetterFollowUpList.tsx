"use client";

import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Clock, Mail, User } from "lucide-react";
import type { SetterFollowUp } from "@/lib/setterStats";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
      <Card>
        <CardContent className="p-10 md:p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No follow-ups needed. When you tag an appointment as <span className="font-medium text-foreground">Needs follow-up</span>, it shows up here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {followUps.map((f) => (
        <Card key={f.appointmentId}>
          <CardContent className="flex items-start justify-between gap-3 p-4 md:p-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge tone="warning">Needs follow-up</StatusBadge>
                {f.clientName && (
                  <span className="inline-flex items-center gap-1 text-sm font-medium">
                    <User className="size-3 text-muted-foreground" />
                    {f.clientName}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  {formatWhen(f.scheduledAt)}
                </span>
                {f.clientEmail && (
                  <a
                    href={`mailto:${f.clientEmail}`}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    <Mail className="size-3" />
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
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link href="/closer/setter/appointments">Open</Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
