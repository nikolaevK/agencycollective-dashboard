"use client";

import { useEffect } from "react";
import { useAdmin } from "@/components/providers/AdminProvider";

// 60s heartbeat is paired with a 90s freshness window in lib/conversations.ts
// (PRESENCE_FRESH_SECONDS) — the 1.5x buffer prevents online ↔ offline flicker
// at the boundary between heartbeats.
const HEARTBEAT_INTERVAL_MS = 60_000;

/**
 * Mounts inside the admin shell. Posts a single tiny "I'm here" ping every
 * 30 seconds while the tab is visible, so client-portal users see "Team is
 * online". Pauses entirely when the tab is hidden — we don't burn requests
 * for backgrounded sessions.
 *
 * Gated by the `users` permission because that's the same gate that controls
 * access to the support feature; admins without it can't reply anyway, so
 * counting them as "online" would mislead the client.
 */
export function AdminPresenceHeartbeat() {
  const admin = useAdmin();
  const enabled = admin.isSuper || admin.permissions.users;

  useEffect(() => {
    if (!enabled) return;
    if (typeof document === "undefined") return;

    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    function ping() {
      void fetch("/api/admin/support/presence", { method: "POST" }).catch(() => {});
    }

    function start() {
      if (timer || stopped) return;
      ping();
      timer = setInterval(ping, HEARTBEAT_INTERVAL_MS);
    }

    function stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    function onVisibility() {
      if (document.visibilityState === "visible") start();
      else stop();
    }

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);

  return null;
}
