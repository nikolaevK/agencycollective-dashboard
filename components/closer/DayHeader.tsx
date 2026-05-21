"use client";

import { useEffect, useState } from "react";
import { format, isSameDay, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

export interface DayHeaderInfo {
  /** Big number ("27"). */
  dayNum: string;
  /** Short month ("Apr"). */
  month: string;
  /** Weekday — "Today" / "Tomorrow" / "Monday" etc. */
  weekday: string;
  /** Long secondary label — "Monday, April 27" or empty for Today/Tomorrow. */
  longLabel: string;
  isToday: boolean;
  isPast: boolean;
}

export interface DayCalendarRefs {
  today: Date;
  tomorrow: Date;
  startOfToday: Date;
}

/** Build once per render, pass into every `dayHeaderInfo` call so we don't
 *  allocate three Dates per day. The result is frozen so a downstream
 *  caller can't accidentally mutate the underlying Dates and corrupt every
 *  subsequent `dayHeaderInfo` call in the same render. */
export function makeCalendarRefs(): DayCalendarRefs {
  const now = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(now.getDate() + 1);
  return Object.freeze({
    today: now,
    tomorrow,
    startOfToday: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
  });
}

/**
 * Schedules a re-render just after the next local midnight so the "Today"
 * badge flips to the new day without waiting for the next data refetch
 * (which can be up to 2 minutes on the calendar surfaces). Cleans up its
 * timer on unmount and reschedules itself after each tick.
 */
export function useMidnightTick(): void {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const now = new Date();
    // +1s past midnight so the new Date() inside the next render is
    // unambiguously on the new day, not at the boundary.
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      1
    );
    const timer = setTimeout(() => setTick((t) => t + 1), nextMidnight.getTime() - now.getTime());
    return () => clearTimeout(timer);
    // Re-run after each tick to schedule the *next* midnight; using `[tick]`
    // (instead of no deps) avoids reset-on-every-render churn.
  }, [tick]);
}

export function dayHeaderInfo(dateStr: string, refs: DayCalendarRefs): DayHeaderInfo {
  // parseISO returns Invalid Date silently on bad input — date-fns `format`
  // then throws RangeError, which would crash the calendar list. Guard explicitly.
  const date = parseISO(dateStr);
  if (isNaN(date.getTime())) {
    return { dayNum: "?", month: "", weekday: dateStr, longLabel: "", isToday: false, isPast: false };
  }
  const isToday = isSameDay(date, refs.today);
  const isTomorrow = isSameDay(date, refs.tomorrow);
  return {
    dayNum: format(date, "d"),
    month: format(date, "MMM"),
    weekday: isToday ? "Today" : isTomorrow ? "Tomorrow" : format(date, "EEEE"),
    longLabel: isToday || isTomorrow ? format(date, "EEEE, MMMM d") : format(date, "MMMM d"),
    isToday,
    isPast: date < refs.startOfToday && !isToday,
  };
}

interface DayHeaderProps {
  info: DayHeaderInfo;
  eventCount: number;
}

export function DayHeader({ info, eventCount }: DayHeaderProps) {
  return (
    // Sticky inside its parent <section>, so as the user scrolls through a
    // day's events the date stays pinned to the top of the viewport. The
    // next day's section, when its header reaches the same offset, naturally
    // pushes the previous one out (sticky elements unstick when they leave
    // their parent's range).
    //
    // `top: var(--calendar-nav-h, 9rem)` — the calendar pages set this
    // CSS variable to the live height of the sticky week-nav via
    // `useElementHeightVar`. Using the actual measured height means the
    // day header always lands flush with the bottom of the nav regardless
    // of how many filter rows (owner / sub-account) are visible. 9rem is
    // the conservative fallback for any caller that doesn't set the var.
    //
    // z-10 sits below the page's z-20 week navigator (so prev/next stays
    // on top) and above z-auto event cards (so cards scroll behind it).
    //
    // Opaque-ish background + backdrop-blur prevents the scrolling-behind
    // event cards from bleeding through. -mx-px keeps the bottom border
    // flush with the event-card column edge.
    <div
      className={cn(
        "sticky top-[var(--calendar-nav-h,9rem)] z-10 mb-3 pb-2 border-b -mx-px px-px",
        "bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        info.isToday ? "border-primary/40" : "border-border/40"
      )}
    >
      {/* Mobile: single compact row. The big purple date card is too tall
          on phones where every pixel of vertical space matters. */}
      <div className="flex sm:hidden items-center gap-2 pt-2 pb-0.5">
        <span
          className={cn(
            "shrink-0 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide tabular-nums",
            info.isToday
              ? "bg-primary/15 text-primary"
              : info.isPast
                ? "bg-muted/40 text-muted-foreground"
                : "bg-muted/40 text-foreground"
          )}
        >
          {info.month} {info.dayNum}
        </span>
        <span
          className={cn(
            "truncate text-xs font-semibold",
            info.isToday ? "text-primary" : "text-foreground"
          )}
        >
          {info.weekday}
        </span>
        <span className="shrink-0 ml-auto text-[10px] font-medium text-muted-foreground tabular-nums">
          {eventCount} {eventCount === 1 ? "event" : "events"}
        </span>
      </div>

      {/* Desktop: full date card. */}
      <div className="hidden sm:flex items-center gap-3 pt-2">
        <div
          className={cn(
            "flex flex-col items-center justify-center shrink-0 w-12 h-12 rounded-xl border",
            info.isToday
              ? "border-primary/40 bg-primary/10 text-primary"
              : info.isPast
                ? "border-border/50 bg-muted/40 text-muted-foreground"
                : "border-border/60 bg-card text-foreground"
          )}
        >
          <span className="text-[9px] font-semibold uppercase leading-none mt-0.5">{info.month}</span>
          <span className="text-lg font-bold leading-none mt-0.5 tabular-nums">{info.dayNum}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm font-semibold truncate",
              info.isToday ? "text-primary" : "text-foreground"
            )}
          >
            {info.weekday}
          </p>
          {info.longLabel && info.weekday !== info.longLabel && (
            <p className="text-xs text-muted-foreground truncate">{info.longLabel}</p>
          )}
        </div>
        <span className="shrink-0 text-[11px] font-medium text-muted-foreground tabular-nums">
          {eventCount} {eventCount === 1 ? "event" : "events"}
        </span>
      </div>
    </div>
  );
}
