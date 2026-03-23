"use client";

import { useState, useTransition } from "react";
import { CalendarDays, ExternalLink, Unplug, CheckCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  connected: boolean;
  email?: string;
  isAdmin: boolean;
}

export function GoogleConnectCard({ connected, email, isAdmin }: Props) {
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();

  function handleDisconnect() {
    if (!confirm("Disconnect Google Calendar? All users will lose access to calendar events.")) return;
    startTransition(async () => {
      await fetch("/api/auth/google/disconnect", { method: "POST" });
      queryClient.invalidateQueries({ queryKey: ["google-calendar-status"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    });
  }

  if (connected) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/15">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Google Calendar Connected</p>
              {email && (
                <p className="text-xs text-muted-foreground mt-0.5">{email}</p>
              )}
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={handleDisconnect}
              disabled={isPending}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
            >
              <Unplug className="h-3.5 w-3.5" />
              Disconnect
            </button>
          )}
        </div>
      </div>
    );
  }

  if (isAdmin) {
    return (
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-8 text-center">
        <div className="flex justify-center mb-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <CalendarDays className="h-7 w-7 text-primary" />
          </div>
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Connect Google Calendar
        </h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
          Link your team&apos;s Google Calendar to see appointments and easily convert meetings into closed deals.
        </p>
        <a
          href="/api/auth/google/authorize"
          className="inline-flex items-center gap-2 h-10 rounded-lg ac-gradient px-6 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
        >
          <ExternalLink className="h-4 w-4" />
          Connect with Google
        </a>
        <p className="text-xs text-muted-foreground mt-3">
          Read-only access to calendar events. You can disconnect at any time.
        </p>
      </div>
    );
  }

  // Closer view — not connected and not admin
  return (
    <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-8 text-center">
      <div className="flex justify-center mb-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
          <CalendarDays className="h-7 w-7 text-muted-foreground" />
        </div>
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">
        Calendar Not Connected
      </h3>
      <p className="text-sm text-muted-foreground max-w-sm mx-auto">
        Ask your admin to connect the team&apos;s Google Calendar to view appointments and link them to deals.
      </p>
    </div>
  );
}
