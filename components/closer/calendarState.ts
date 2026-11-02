/**
 * Sales-calendar event state: what a calendar card is "at" right now,
 * derived purely from data the calendar lists already hold (the Google
 * event, the attendance mark, a linked deal, the setter's claim, the
 * current time). No React and no db imports, so the closer/admin list
 * (CalendarEventList) and the setter list (SetterCalendarEventList) share
 * one rulebook, and __tests__/calendarState.test.ts can pin the precedence.
 *
 * Precedence principle: a record a person wrote AFTER the call (a linked
 * deal, an attendance mark, the setter's post-call status) outranks a
 * pre-call signal (Google "cancelled", the setter's pre-call "cancelled"),
 * which outranks the clock. The card then agrees with what the metrics
 * count (revenue follows the deal, show rate follows attendance).
 */
import type { BadgeTone } from "@/components/ui/badge";
import type { DealStatus } from "@/lib/deals";
import type { PostCallStatus, PreCallStatus } from "@/lib/appointmentRules";
import type { AttendeeResponseStatus } from "@/components/closer/CalendarEventList";

export type CloserCalendarState =
  | "deal_closed"
  | "deal_pending"
  | "deal_follow_up"
  | "deal_rescheduled"
  | "deal_not_closed"
  | "deal_linked"
  | "no_show"
  | "showed"
  | "cancelled"
  | "all_day"
  | "live"
  | "needs_outcome"
  | "upcoming";

export type SetterCalendarState =
  | "qualified"
  | "followed_up"
  | "needs_followup"
  | "post_no_answer"
  | "disqualified"
  | "no_show"
  | "showed"
  | "cancelled"
  | "all_day"
  | "live"
  | "awaiting_outcome"
  | "rescheduled"
  | "confirmed"
  | "claimed"
  | "unclaimed";

export type CalendarStateKey = CloserCalendarState | SetterCalendarState;

/** strong = solid rail + strong ring; normal = solid rail + faint ring;
 *  muted = faded rail, no ring tint (a settled or inactive event). */
export type CalendarEmphasis = "strong" | "normal" | "muted";

export interface CalendarStateMeta {
  label: string;
  tone: BadgeTone;
  emphasis: CalendarEmphasis;
}

export const CALENDAR_STATE_META: Record<CalendarStateKey, CalendarStateMeta> = {
  deal_closed: { label: "Deal closed", tone: "success", emphasis: "strong" },
  deal_pending: { label: "Pending signature", tone: "info", emphasis: "normal" },
  deal_follow_up: { label: "Deal follow-up", tone: "warning", emphasis: "normal" },
  deal_rescheduled: { label: "Deal rescheduled", tone: "warning", emphasis: "normal" },
  deal_not_closed: { label: "Deal not closed", tone: "neutral", emphasis: "normal" },
  // A linked deal whose status the caller didn't pass — the old "Deal Linked".
  deal_linked: { label: "Deal linked", tone: "success", emphasis: "strong" },
  no_show: { label: "No-show", tone: "danger", emphasis: "normal" },
  showed: { label: "Showed", tone: "success", emphasis: "muted" },
  cancelled: { label: "Cancelled", tone: "danger", emphasis: "muted" },
  all_day: { label: "All day", tone: "neutral", emphasis: "muted" },
  live: { label: "Live now", tone: "info", emphasis: "strong" },
  needs_outcome: { label: "Needs outcome", tone: "warning", emphasis: "normal" },
  upcoming: { label: "Upcoming", tone: "neutral", emphasis: "normal" },
  qualified: { label: "Qualified", tone: "success", emphasis: "strong" },
  followed_up: { label: "Followed up", tone: "success", emphasis: "normal" },
  needs_followup: { label: "Needs follow-up", tone: "warning", emphasis: "normal" },
  post_no_answer: { label: "No answer", tone: "warning", emphasis: "normal" },
  disqualified: { label: "Disqualified", tone: "neutral", emphasis: "normal" },
  awaiting_outcome: { label: "Awaiting outcome", tone: "neutral", emphasis: "normal" },
  rescheduled: { label: "Rescheduled", tone: "warning", emphasis: "normal" },
  confirmed: { label: "Confirmed", tone: "success", emphasis: "normal" },
  claimed: { label: "Claimed", tone: "info", emphasis: "normal" },
  unclaimed: { label: "Unclaimed", tone: "neutral", emphasis: "muted" },
};

/** Legend order — the call's lifecycle, not the precedence. */
export const CLOSER_STATE_ORDER: readonly CloserCalendarState[] = [
  "upcoming",
  "live",
  "needs_outcome",
  "showed",
  "no_show",
  "deal_closed",
  "deal_pending",
  "deal_follow_up",
  "deal_rescheduled",
  "deal_not_closed",
  "deal_linked",
  "cancelled",
  "all_day",
];

export const SETTER_STATE_ORDER: readonly SetterCalendarState[] = [
  "unclaimed",
  "claimed",
  "confirmed",
  "rescheduled",
  "live",
  "awaiting_outcome",
  "showed",
  "no_show",
  "needs_followup",
  "post_no_answer",
  "followed_up",
  "qualified",
  "disqualified",
  "cancelled",
  "all_day",
];

/** The slice of a Google event the state needs (CalendarEvent fits). */
export interface CalendarEventTiming {
  start: string;
  end: string;
  status: string;
  allDay: boolean;
}

type Timing = "all_day" | "upcoming" | "live" | "ended";

function timingOf(event: CalendarEventTiming, now: number): Timing {
  if (event.allDay) return "all_day";
  const start = Date.parse(event.start);
  // Unparseable start: nothing time-based can be claimed about it.
  if (Number.isNaN(start)) return "upcoming";
  const parsedEnd = Date.parse(event.end);
  const end = Number.isNaN(parsedEnd) ? start : Math.max(parsedEnd, start);
  if (now < start) return "upcoming";
  if (now < end) return "live";
  return "ended";
}

export interface CloserEventStateInput {
  event: CalendarEventTiming;
  /** Attendance mark for the event ("showed" | "no_show"), if any. */
  attendance?: string | null;
  /** The event has a linked deal (the list's linkedEventIds). */
  dealLinked?: boolean;
  /** That deal's status, when the caller passes it. */
  dealStatus?: DealStatus | null;
  /** Setter claim's pre-call status, when a setter claimed the event. */
  preCallStatus?: PreCallStatus | null;
  /** Current time, epoch ms. */
  now: number;
}

/** State for the closer portal + admin Team Calendar list. */
export function closerEventState(input: CloserEventStateInput): CloserCalendarState {
  const { event, attendance, dealLinked, dealStatus, preCallStatus, now } = input;
  if (dealLinked) {
    switch (dealStatus) {
      case "closed":
        return "deal_closed";
      case "pending_signature":
        return "deal_pending";
      case "follow_up":
        return "deal_follow_up";
      case "rescheduled":
        return "deal_rescheduled";
      case "not_closed":
        return "deal_not_closed";
      default:
        return "deal_linked";
    }
  }
  if (attendance === "no_show") return "no_show";
  if (attendance === "showed") return "showed";
  if (event.status === "cancelled" || preCallStatus === "cancelled") return "cancelled";
  const timing = timingOf(event, now);
  if (timing === "all_day") return "all_day";
  if (timing === "live") return "live";
  if (timing === "ended") return "needs_outcome";
  return "upcoming";
}

const CONFIRMED_PRE_CALL: ReadonlySet<PreCallStatus> = new Set<PreCallStatus>([
  "confirmed",
  "auto_confirmed",
  "triaged_confirmed",
]);

export interface SetterEventStateInput {
  event: CalendarEventTiming;
  /** The setter has claimed the event. */
  claimed: boolean;
  preCallStatus?: PreCallStatus | null;
  postCallStatus?: PostCallStatus | null;
  /** Team-wide attendance mark ("showed" | "no_show"), if any. */
  attendance?: string | null;
  /** Current time, epoch ms. */
  now: number;
}

/** State for the setter's Appointments list. */
export function setterEventState(input: SetterEventStateInput): SetterCalendarState {
  const { event, claimed, preCallStatus, postCallStatus, attendance, now } = input;
  if (!claimed) {
    if (event.status === "cancelled") return "cancelled";
    if (event.allDay) return "all_day";
    return "unclaimed";
  }
  // The post-call status is the setter's latest step after the call (it
  // tracks working a no-show back), so it wins over the attendance mark.
  switch (postCallStatus) {
    case "qualified":
      return "qualified";
    case "followed_up":
      return "followed_up";
    case "needs_followup":
      return "needs_followup";
    case "no_answer":
      return "post_no_answer";
    case "disqualified":
      return "disqualified";
  }
  if (attendance === "no_show") return "no_show";
  if (attendance === "showed") return "showed";
  if (event.status === "cancelled" || preCallStatus === "cancelled") return "cancelled";
  const timing = timingOf(event, now);
  if (timing === "live") return "live";
  // The closer marks attendance, not the setter — nothing to do yet.
  if (timing === "ended") return "awaiting_outcome";
  // A Google reschedule keeps the event id and moves its time, so
  // "rescheduled" only describes calls still ahead.
  if (preCallStatus === "rescheduled") return "rescheduled";
  if (preCallStatus && CONFIRMED_PRE_CALL.has(preCallStatus)) return "confirmed";
  return "claimed";
}

/** Count per state, for the legend row. */
export function countCalendarStates(
  states: Iterable<CalendarStateKey>
): Partial<Record<CalendarStateKey, number>> {
  const counts: Partial<Record<CalendarStateKey, number>> = {};
  for (const key of states) counts[key] = (counts[key] ?? 0) + 1;
  return counts;
}

// ── Visuals ──────────────────────────────────────────────────────────────
// Kit tone families (components/ui/badge.tsx). Literal class strings so
// Tailwind's scanner sees them.

const RAIL: Record<BadgeTone, string> = {
  success: "bg-emerald-500 dark:bg-emerald-400",
  warning: "bg-amber-500 dark:bg-amber-400",
  danger: "bg-red-500 dark:bg-red-400",
  info: "bg-sky-500 dark:bg-sky-400",
  neutral: "bg-muted-foreground/45",
};

// Dark needs a higher alpha: a faded tone on the near-black card turns muddy.
const RAIL_MUTED: Record<BadgeTone, string> = {
  success: "bg-emerald-500/45 dark:bg-emerald-400/55",
  warning: "bg-amber-500/45 dark:bg-amber-400/55",
  danger: "bg-red-500/45 dark:bg-red-400/55",
  info: "bg-sky-500/45 dark:bg-sky-400/55",
  neutral: "bg-muted-foreground/25",
};

// Override the Card's faint ring-foreground/5 (tailwind-merge keeps the last).
const RING: Record<BadgeTone, string> = {
  success: "ring-emerald-500/25 dark:ring-emerald-400/25",
  warning: "ring-amber-500/30 dark:ring-amber-400/25",
  danger: "ring-red-500/25 dark:ring-red-400/25",
  info: "ring-sky-500/25 dark:ring-sky-400/25",
  neutral: "",
};

// Strong = the old "Deal Linked" ring.
const RING_STRONG: Record<BadgeTone, string> = {
  success: "ring-emerald-500/60 dark:ring-emerald-400/50",
  warning: "ring-amber-500/60 dark:ring-amber-400/50",
  danger: "ring-red-500/60 dark:ring-red-400/50",
  info: "ring-sky-500/60 dark:ring-sky-400/50",
  neutral: "ring-foreground/20",
};

/** The calendar is read at a glance, so its chips carry a stronger outline
 *  than the kit's default tone (user request). Neutral keeps the kit border. */
export const CALENDAR_CHIP_OUTLINE: Record<BadgeTone, string> = {
  success: "border-emerald-500/50 dark:border-emerald-400/45",
  warning: "border-amber-500/50 dark:border-amber-400/45",
  danger: "border-red-500/50 dark:border-red-400/45",
  info: "border-sky-500/50 dark:border-sky-400/45",
  neutral: "",
};

export interface CalendarStateStyle {
  /** Background of the left accent rail (and the legend swatch). */
  rail: string;
  /** Ring color override for the Card. */
  ring: string;
  /** Extra Card classes (the quiet dashed "Unclaimed" card). */
  card: string;
  /** Title text classes. */
  title: string;
}

export function calendarStateStyle(key: CalendarStateKey): CalendarStateStyle {
  const { tone, emphasis } = CALENDAR_STATE_META[key];
  return {
    rail: emphasis === "muted" ? RAIL_MUTED[tone] : RAIL[tone],
    ring: emphasis === "strong" ? RING_STRONG[tone] : emphasis === "normal" ? RING[tone] : "",
    card:
      key === "unclaimed"
        ? "bg-transparent shadow-none ring-0 border border-dashed border-foreground/15"
        : "",
    title:
      key === "cancelled"
        ? "text-muted-foreground line-through decoration-muted-foreground/60"
        : key === "all_day"
          ? "text-muted-foreground"
          : "",
  };
}

// ── Shared chip vocab (both lists) ───────────────────────────────────────

export const ATTENDEE_RESPONSE_META: Record<AttendeeResponseStatus, { label: string; tone: BadgeTone }> = {
  accepted: { label: "Accepted", tone: "success" },
  declined: { label: "Declined", tone: "danger" },
  tentative: { label: "Maybe", tone: "warning" },
  needsAction: { label: "Pending", tone: "neutral" },
};

/** Google event status pills (secondary to the state chip). */
export const EVENT_STATUS_PILL: Record<string, { label: string; tone: BadgeTone }> = {
  tentative: { label: "Tentative", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

// Tones for the setter's pre/post-call chips (labels stay the shared
// PRE_CALL_LABELS / POST_CALL_LABELS).
export const PRE_CALL_TONE: Record<PreCallStatus, BadgeTone> = {
  not_called: "neutral",
  auto_confirmed: "success",
  auto_no_answer: "warning",
  triaged_confirmed: "success",
  confirmed: "success",
  no_answer: "warning",
  voicemail: "info",
  // warning/neutral (not info/danger) so these chips agree with the card's
  // state chip for the same status.
  rescheduled: "warning",
  cancelled: "danger",
};

export const POST_CALL_TONE: Record<PostCallStatus, BadgeTone> = {
  not_called: "neutral",
  followed_up: "success",
  needs_followup: "warning",
  qualified: "success",
  disqualified: "neutral",
  no_answer: "warning",
};
