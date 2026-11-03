/**
 * Remembers the desktop sidebar rail (expanded / collapsed). Written by
 * DashboardClientShell on toggle, read by app/dashboard/layout.tsx so the
 * first server render already has the right width (no flash, no hydration
 * mismatch). Plain module — safe to import from server and client code.
 */
export const SIDEBAR_COOKIE = "ac_sidebar";
export const SIDEBAR_COLLAPSED = "collapsed";
