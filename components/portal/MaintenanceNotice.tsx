"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { badgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const ACK_KEY = "ac-maintenance-ack";

/**
 * Client-portal maintenance notice. Renders two things when maintenance mode
 * is on:
 *  1. A persistent amber banner at the top of every portal page (always
 *     visible — also the first thing seen on login).
 *  2. A more prominent dismissible alert shown once per browser session
 *     (≈ once per login). It re-appears if the admin changes the message.
 */
export function MaintenanceNotice({ message }: { message: string }) {
  const [showAlert, setShowAlert] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(ACK_KEY) !== message) setShowAlert(true);
    } catch {
      setShowAlert(true);
    }
  }, [message]);

  function dismiss() {
    try {
      sessionStorage.setItem(ACK_KEY, message);
    } catch {
      /* sessionStorage unavailable — alert just won't persist its dismissal */
    }
    setShowAlert(false);
  }

  return (
    <>
      {/* Persistent banner — across all portal pages */}
      <div
        role="status"
        aria-live="polite"
        className={cn("flex items-start gap-2 border-b px-4 py-2.5 md:px-6", badgeTone.warning)}
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="text-sm font-medium leading-snug">{message}</p>
      </div>

      {/* One-time login alert */}
      {showAlert && (
        <div
          aria-label="Maintenance notice"
          className="fixed bottom-20 right-4 z-50 w-[calc(100%-2rem)] max-w-sm rounded-3xl bg-card p-4 text-card-foreground shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10 md:bottom-4"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-foreground">Maintenance in progress</h3>
              <p className="mt-1 text-sm leading-snug text-muted-foreground">{message}</p>
              <Button size="sm" onClick={dismiss} className="mt-3">
                Got it
              </Button>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={dismiss}
              className="-mr-1 -mt-1 text-muted-foreground"
              aria-label="Dismiss"
            >
              <X />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
