"use client";

import { useState, useTransition } from "react";
import { CalendarDays, ExternalLink, Unplug, CheckCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/use-confirm";

interface Props {
  connected: boolean;
  email?: string;
  isAdmin: boolean;
}

export function GoogleConnectCard({ connected, email, isAdmin }: Props) {
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();

  async function handleDisconnect() {
    if (
      !(await confirm({
        title: "Disconnect Google Calendar?",
        description: "All users will lose access to calendar events.",
        destructive: true,
        confirmText: "Disconnect",
      }))
    )
      return;
    startTransition(async () => {
      await fetch("/api/auth/google/disconnect", { method: "POST" });
      queryClient.invalidateQueries({ queryKey: ["google-calendar-status"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    });
  }

  if (connected) {
    return (
      <Card className="p-4 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Google Calendar Connected</p>
              {email && (
                <p className="text-xs text-muted-foreground mt-0.5 break-all">{email}</p>
              )}
            </div>
          </div>
          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDisconnect}
              disabled={isPending}
              className="shrink-0 text-muted-foreground hover:text-destructive"
            >
              <Unplug />
              Disconnect
            </Button>
          )}
        </div>
        {dialog}
      </Card>
    );
  }

  if (isAdmin) {
    return (
      <Card className="p-8 text-center">
        <div className="flex justify-center mb-4">
          <CalendarDays className="size-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold tracking-tight text-foreground mb-2">
          Connect Google Calendar
        </h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
          Link your team&apos;s Google Calendar to see appointments and easily convert meetings into closed deals.
        </p>
        <Button asChild size="lg">
          <a href="/api/auth/google/authorize">
            <ExternalLink />
            Connect with Google
          </a>
        </Button>
        <p className="text-xs text-muted-foreground mt-3">
          Read-only access to calendar events. You can disconnect at any time.
        </p>
      </Card>
    );
  }

  // Closer view — not connected and not admin
  return (
    <Card className="p-8 text-center">
      <div className="flex justify-center mb-4">
        <CalendarDays className="size-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold tracking-tight text-foreground mb-2">
        Calendar Not Connected
      </h3>
      <p className="text-sm text-muted-foreground max-w-sm mx-auto">
        Ask your admin to connect the team&apos;s Google Calendar to view appointments and link them to deals.
      </p>
    </Card>
  );
}
