"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

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
        className="flex items-start gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="text-sm font-medium leading-snug">{message}</p>
      </div>

      {/* One-time login alert */}
      {showAlert && (
        <div
          aria-label="Maintenance notice"
          className="fixed bottom-20 right-4 z-50 w-[calc(100%-2rem)] max-w-sm rounded-xl border border-amber-300 bg-card p-4 shadow-2xl dark:border-amber-800 md:bottom-4"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-foreground">Maintenance in progress</h3>
              <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{message}</p>
              <button
                onClick={dismiss}
                className="mt-3 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600"
              >
                Got it
              </button>
            </div>
            <button
              onClick={dismiss}
              className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
