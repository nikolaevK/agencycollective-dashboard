"use client";

import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";

export function NotificationBell() {
  const { isSupported, isSubscribed, isLoading, isPWA, subscribe, unsubscribe } = usePushNotifications();
  const [busy, setBusy] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, []);

  // Render disabled placeholder while loading to prevent layout shift
  if (isLoading) {
    return (
      <Button variant="outline" size="icon" disabled aria-label="Push notifications">
        <Bell />
      </Button>
    );
  }

  // On desktop, hide if not supported (e.g. very old browser)
  // On mobile, always show — so we can display the install hint
  if (!isSupported && !isMobile) return null;

  const showInstallHint = isMobile && !isPWA;
  const showSubscribeUI = isSupported && !showInstallHint;

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

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative" aria-label="Push notifications">
          {isSubscribed ? <BellRing className="text-primary" /> : <Bell />}
          {isSubscribed && (
            <span aria-hidden className="absolute right-2 top-2 size-1.5 rounded-full bg-primary" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        {showInstallHint ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Install App First</p>
            <p className="text-xs text-muted-foreground">
              To receive push notifications, add this app to your Home Screen first. Tap the share button, then &quot;Add to Home Screen&quot;.
            </p>
          </div>
        ) : showSubscribeUI ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {isSubscribed ? (
                <BellRing className="size-4 text-primary" />
              ) : (
                <BellOff className="size-4 text-muted-foreground" />
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
            <Button onClick={handleToggle} disabled={busy} className="w-full">
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : isSubscribed ? (
                "Disable notifications"
              ) : (
                "Enable notifications"
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium">Not Supported</p>
            <p className="text-xs text-muted-foreground">
              Push notifications are not supported in this browser.
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
