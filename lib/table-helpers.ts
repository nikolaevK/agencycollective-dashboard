/**
 * Shared constants and utilities for data tables across the dashboard.
 */

/** ROAS value at or above which we highlight in green */
export const ROAS_GOOD_THRESHOLD = 4;

/** Status → Tailwind class map for inline status pills */
export const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
  PAUSED: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
  ARCHIVED: "bg-muted text-muted-foreground",
  DELETED: "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400",
  IN_PROCESS: "bg-muted text-muted-foreground",
  WITH_ISSUES: "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400",
  DISAPPROVED: "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400",
};

/** Fallback style when status key is not found */
export const STATUS_STYLE_DEFAULT = "bg-muted text-muted-foreground";
