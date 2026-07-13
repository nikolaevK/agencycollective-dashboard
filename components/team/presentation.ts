import type { TaskStatus, TaskPriority, ActionSourceType, TeamAttribution } from "./types";

// ---------------------------------------------------------------------------
// Team hub presentation maps — pure label/color constants, mirroring the
// rosterPresentation idiom (bg-{color}-500/10 + text-{color}-600/dark-400).
// Status/priority vocabularies are FIXED (lib/teamTasks.ts).
// ---------------------------------------------------------------------------

export const TASK_STATUS_META: Record<
  TaskStatus,
  { label: string; chip: string; dot: string }
> = {
  todo: {
    label: "To Do",
    chip: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
    dot: "bg-slate-400",
  },
  in_progress: {
    label: "In Progress",
    chip: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    dot: "bg-blue-500",
  },
  review: {
    label: "Review",
    chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  complete: {
    label: "Complete",
    chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
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
  { label: string; chip: string; flag: string }
> = {
  urgent: {
    label: "Urgent",
    chip: "bg-red-500/10 text-red-600 dark:text-red-400",
    flag: "text-red-500",
  },
  high: {
    label: "High",
    chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    flag: "text-amber-500",
  },
  normal: {
    label: "Normal",
    chip: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    flag: "text-sky-500",
  },
  low: {
    label: "Low",
    chip: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
    flag: "text-slate-400",
  },
};

export const TASK_PRIORITY_ORDER: TaskPriority[] = ["urgent", "high", "normal", "low"];

export const SOURCE_META: Record<
  ActionSourceType,
  { label: string; chip: string; symbol: string }
> = {
  slack: {
    label: "Slack",
    chip: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400",
    symbol: "◆",
  },
  dashboard: {
    label: "Dashboard",
    chip: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    symbol: "▣",
  },
  system: {
    label: "System",
    chip: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
    symbol: "⚙",
  },
};

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

/** Deterministic avatar tint per member (mockup-style colored tiles). */
const AVATAR_TINTS = [
  "bg-violet-500",
  "bg-cyan-500",
  "bg-emerald-500",
  "bg-blue-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-fuchsia-500",
  "bg-teal-500",
];

export function avatarTint(seed: string): string {
  let x = 0;
  for (const ch of seed) x = (x * 31 + ch.charCodeAt(0)) % 997;
  return AVATAR_TINTS[x % AVATAR_TINTS.length];
}
