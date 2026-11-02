import { Bot, LayoutDashboard, Slack, type LucideIcon } from "lucide-react";
import type { BadgeTone } from "@/components/ui/badge";
import type {
  TaskStatus,
  TaskPriority,
  ActionSourceType,
  TeamAttribution,
  MonthlyRebillBucket,
} from "./types";

// ---------------------------------------------------------------------------
// Team hub presentation maps — pure label/tone constants for the shadcn kit
// (StatusBadge / BadgeDot tones, components/ui/badge). Status-like vocab maps
// to a meaning; categories (sources, clients) stay neutral. Status/priority
// vocabularies are FIXED (lib/teamTasks.ts).
// ---------------------------------------------------------------------------

export const TASK_STATUS_META: Record<
  TaskStatus,
  { label: string; tone: BadgeTone }
> = {
  todo: {
    label: "To Do",
    tone: "neutral",
  },
  in_progress: {
    label: "In Progress",
    tone: "info",
  },
  review: {
    label: "Review",
    tone: "warning",
  },
  complete: {
    label: "Complete",
    tone: "success",
  },
};

export const TASK_STATUS_ORDER: TaskStatus[] = [
  "todo",
  "in_progress",
  "review",
  "complete",
];

export const TASK_PRIORITY_META: Record<
  TaskPriority,
  { label: string; tone: BadgeTone; flag: string }
> = {
  urgent: {
    label: "Urgent",
    tone: "danger",
    flag: "text-red-600 dark:text-red-400",
  },
  high: {
    label: "High",
    tone: "warning",
    flag: "text-amber-600 dark:text-amber-400",
  },
  // The default priority stays quiet — color only where it matters.
  normal: {
    label: "Normal",
    tone: "neutral",
    flag: "text-muted-foreground/70",
  },
  low: {
    label: "Low",
    tone: "neutral",
    flag: "text-muted-foreground/40",
  },
};

export const TASK_PRIORITY_ORDER: TaskPriority[] = ["urgent", "high", "normal", "low"];

export const SOURCE_META: Record<
  ActionSourceType,
  { label: string; icon: LucideIcon }
> = {
  slack: {
    label: "Slack",
    icon: Slack,
  },
  dashboard: {
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  system: {
    label: "System",
    icon: Bot,
  },
};

/**
 * Monthly re-bill tracker buckets — the same colors as the Overview's re-bill
 * bar and the Client Directory's RebillStatusChip (collected = success, sent
 * = info, due = warning, overdue = danger). `bar: null` buckets render as the
 * muted track, never a fill.
 */
export const MONTHLY_REBILL_META: Record<
  MonthlyRebillBucket,
  { label: string; tone: BadgeTone; bar: string | null }
> = {
  collected: { label: "Collected", tone: "success", bar: "bg-emerald-500" },
  sent: { label: "Sent", tone: "info", bar: "bg-sky-500" },
  due: { label: "Due", tone: "warning", bar: "bg-amber-500" },
  overdue: { label: "Overdue", tone: "danger", bar: "bg-red-500" },
  scheduled: { label: "Upcoming", tone: "neutral", bar: null },
  untracked: { label: "Untracked", tone: "neutral", bar: null },
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-07" → "July" (business-month label; falls back to the raw string). */
export function monthName(month: string): string {
  return MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? month;
}

export const ATTRIBUTION_LABEL: Record<TeamAttribution, string> = {
  book: "Entire book",
  lead: "Head of Ads",
  media_buyer: "Media Buyer",
  csm: "Client Success Manager",
};

export const TIMEFRAME_OPTIONS: { value: "today" | "week" | "month"; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
];

export const TIMEFRAME_PHRASE: Record<"today" | "week" | "month", string> = {
  today: "today",
  week: "this week",
  month: "this month",
};

/** "2026-07" → "Jul 2026" (Intl, so chart readouts don't pull in date-fns). */
export function shortMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!Number.isFinite(y) || !(m >= 1 && m <= 12)) return ym;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "2026-10-26" (a week's Monday) → "Week of Oct 26". */
export function weekOfLabel(ymd: string): string {
  return `Week of ${new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })}`;
}
