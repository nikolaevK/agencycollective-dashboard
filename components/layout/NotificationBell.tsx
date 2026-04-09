"use client";

import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useState } from "react";

export function NotificationBell() {
  const { isSupported, isSubscribed, isLoading, isPWA, subscribe, unsubscribe } = usePushNotifications();
  const [busy, setBusy] = useState(false);

  // Not supported at all — hide (after loading check)
  if (!isLoading && !isSupported) return null;

  // Render disabled placeholder while loading to prevent layout shift
  if (isLoading) {
    return (
      <button
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground opacity-50"
        disabled
        aria-label="Push notifications"
      >
        <Bell className="h-4 w-4" />
      </button>
    );
  }

  async function handleToggle() {
    setBusy(true);
    try {
      if (isSubscribed) {
        await unsubscribe();
      } else {
        await subscribe();
      }
    } finally {
      setBusy(false);
    }
  }

  const isMobile = typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const showInstallHint = isMobile && !isPWA;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground transition-colors relative"
          aria-label="Push notifications"
        >
          {isSubscribed ? (
            <BellRing className="h-4 w-4 text-primary" />
          ) : (
            <Bell className="h-4 w-4" />
          )}
          {isSubscribed && (
            <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        {showInstallHint ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Install App First</p>
            <p className="text-xs text-muted-foreground">
              To receive push notifications, add this app to your Home Screen first. Tap the share button, then &quot;Add to Home Screen&quot;.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {isSubscribed ? (
                <BellRing className="h-4 w-4 text-primary" />
              ) : (
                <BellOff className="h-4 w-4 text-muted-foreground" />
              )}
              <p className="text-sm font-medium">
                {isSubscribed ? "Notifications enabled" : "Notifications off"}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {isSubscribed
                ? "You'll be notified when new deals need review."
                : "Get notified when closers create new deals."}
            </p>
            <button
              onClick={handleToggle}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isSubscribed ? (
                "Disable notifications"
              ) : (
                "Enable notifications"
              )}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
