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
    <div
      className={cn(
        "mb-3 pb-2 border-b",
        info.isToday ? "border-primary/40" : "border-border/40"
      )}
    >
      <div className="flex items-center gap-3">
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
