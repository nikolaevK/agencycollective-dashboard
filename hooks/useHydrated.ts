"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False on the server and during hydration, true afterwards (and on every
 * client-side navigation). The dashboard shell's Sidebar/TopBar fetch the
 * accounts + alerts queries from their own Suspense boundaries; when that
 * data lands before a page's boundary hydrates, the page would render data
 * the server never had (React #425). Pages render their loading skeleton
 * until hydrated — the server never has this data anyway.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
