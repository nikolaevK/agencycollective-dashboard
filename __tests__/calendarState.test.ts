import { describe, expect, it } from "vitest";
import {
  CALENDAR_STATE_META,
  CLOSER_STATE_ORDER,
  SETTER_STATE_ORDER,
  calendarStateStyle,
  closerEventState,
  countCalendarStates,
  setterEventState,
  type CalendarEventTiming,
} from "@/components/closer/calendarState";

const START = "2026-11-02T10:00:00-08:00";
const END = "2026-11-02T10:30:00-08:00";
const BEFORE = Date.parse("2026-11-02T09:00:00-08:00");
const DURING = Date.parse("2026-11-02T10:15:00-08:00");
const AFTER = Date.parse("2026-11-02T11:00:00-08:00");

function ev(over: Partial<CalendarEventTiming> = {}): CalendarEventTiming {
  return { start: START, end: END, status: "confirmed", allDay: false, ...over };
}

describe("closerEventState", () => {
  it("follows the clock when nothing is recorded", () => {
    expect(closerEventState({ event: ev(), now: BEFORE })).toBe("upcoming");
    expect(closerEventState({ event: ev(), now: Date.parse(START) })).toBe("live");
    expect(closerEventState({ event: ev(), now: DURING })).toBe("live");
    expect(closerEventState({ event: ev(), now: Date.parse(END) })).toBe("needs_outcome");
    expect(closerEventState({ event: ev(), now: AFTER })).toBe("needs_outcome");
  });

  it("never asks for an outcome on all-day events", () => {
    const allDay = ev({ start: "2026-11-02", end: "2026-11-03", allDay: true });
    expect(closerEventState({ event: allDay, now: BEFORE })).toBe("all_day");
    expect(closerEventState({ event: allDay, now: AFTER })).toBe("all_day");
  });

  it("cancelled (Google or the setter's pre-call) beats the clock", () => {
    expect(closerEventState({ event: ev({ status: "cancelled" }), now: AFTER })).toBe("cancelled");
    expect(closerEventState({ event: ev(), preCallStatus: "cancelled", now: DURING })).toBe("cancelled");
    expect(
      closerEventState({ event: ev({ status: "cancelled", allDay: true }), now: AFTER })
    ).toBe("cancelled");
  });

  it("attendance beats cancellation and the clock", () => {
    expect(closerEventState({ event: ev(), attendance: "no_show", now: AFTER })).toBe("no_show");
    expect(closerEventState({ event: ev(), attendance: "showed", now: DURING })).toBe("showed");
    expect(
      closerEventState({ event: ev({ status: "cancelled" }), attendance: "no_show", now: AFTER })
    ).toBe("no_show");
  });

  it("a linked deal beats everything, by its status", () => {
    const base = { event: ev({ status: "cancelled" }), attendance: "no_show", now: AFTER, dealLinked: true };
    expect(closerEventState({ ...base, dealStatus: "closed" })).toBe("deal_closed");
    expect(closerEventState({ ...base, dealStatus: "pending_signature" })).toBe("deal_pending");
    expect(closerEventState({ ...base, dealStatus: "follow_up" })).toBe("deal_follow_up");
    expect(closerEventState({ ...base, dealStatus: "rescheduled" })).toBe("deal_rescheduled");
    expect(closerEventState({ ...base, dealStatus: "not_closed" })).toBe("deal_not_closed");
    expect(closerEventState({ ...base, dealStatus: null })).toBe("deal_linked");
  });

  it("a deal status without a link is ignored (matches the Link as Deal button)", () => {
    expect(closerEventState({ event: ev(), dealStatus: "closed", now: AFTER })).toBe("needs_outcome");
  });

  it("tolerates bad dates", () => {
    expect(closerEventState({ event: ev({ start: "", end: "" }), now: AFTER })).toBe("upcoming");
    // Missing end: the event ends at its start.
    expect(closerEventState({ event: ev({ end: "" }), now: DURING })).toBe("needs_outcome");
  });
});

describe("setterEventState", () => {
  it("unclaimed events stay quiet unless cancelled or all-day", () => {
    expect(setterEventState({ event: ev(), claimed: false, now: DURING })).toBe("unclaimed");
    expect(setterEventState({ event: ev(), claimed: false, attendance: "showed", now: AFTER })).toBe("unclaimed");
    expect(setterEventState({ event: ev({ status: "cancelled" }), claimed: false, now: BEFORE })).toBe("cancelled");
    expect(setterEventState({ event: ev({ allDay: true }), claimed: false, now: BEFORE })).toBe("all_day");
  });

  it("claimed upcoming: claimed → confirmed / rescheduled by pre-call", () => {
    const base = { event: ev(), claimed: true, now: BEFORE };
    expect(setterEventState({ ...base, preCallStatus: "not_called", postCallStatus: "not_called" })).toBe("claimed");
    expect(setterEventState({ ...base, preCallStatus: "no_answer" })).toBe("claimed");
    expect(setterEventState({ ...base, preCallStatus: "confirmed" })).toBe("confirmed");
    expect(setterEventState({ ...base, preCallStatus: "auto_confirmed" })).toBe("confirmed");
    expect(setterEventState({ ...base, preCallStatus: "triaged_confirmed" })).toBe("confirmed");
    expect(setterEventState({ ...base, preCallStatus: "rescheduled" })).toBe("rescheduled");
    expect(setterEventState({ ...base, preCallStatus: "cancelled" })).toBe("cancelled");
  });

  it("the clock beats confirmation; cancellation beats the clock", () => {
    expect(setterEventState({ event: ev(), claimed: true, preCallStatus: "confirmed", now: DURING })).toBe("live");
    expect(setterEventState({ event: ev(), claimed: true, preCallStatus: "rescheduled", now: AFTER })).toBe(
      "awaiting_outcome"
    );
    expect(setterEventState({ event: ev(), claimed: true, preCallStatus: "cancelled", now: DURING })).toBe("cancelled");
  });

  it("attendance beats pre-call; post-call beats attendance", () => {
    const base = { event: ev(), claimed: true, preCallStatus: "cancelled" as const, now: AFTER };
    expect(setterEventState({ ...base, attendance: "no_show" })).toBe("no_show");
    expect(setterEventState({ ...base, attendance: "showed" })).toBe("showed");
    expect(setterEventState({ ...base, attendance: "no_show", postCallStatus: "not_called" })).toBe("no_show");
    expect(setterEventState({ ...base, attendance: "no_show", postCallStatus: "needs_followup" })).toBe(
      "needs_followup"
    );
    expect(setterEventState({ ...base, attendance: "no_show", postCallStatus: "qualified" })).toBe("qualified");
    expect(setterEventState({ ...base, postCallStatus: "followed_up" })).toBe("followed_up");
    expect(setterEventState({ ...base, postCallStatus: "no_answer" })).toBe("post_no_answer");
    expect(setterEventState({ ...base, postCallStatus: "disqualified" })).toBe("disqualified");
  });
});

describe("meta + helpers", () => {
  it("every state has meta and appears in its legend order exactly once", () => {
    for (const order of [CLOSER_STATE_ORDER, SETTER_STATE_ORDER]) {
      expect(new Set(order).size).toBe(order.length);
      for (const key of order) expect(CALENDAR_STATE_META[key]).toBeDefined();
    }
    const listed = new Set<string>([...CLOSER_STATE_ORDER, ...SETTER_STATE_ORDER]);
    expect([...listed].sort()).toEqual(Object.keys(CALENDAR_STATE_META).sort());
  });

  it("counts states", () => {
    expect(countCalendarStates(["live", "upcoming", "upcoming"])).toEqual({ live: 1, upcoming: 2 });
    expect(countCalendarStates([])).toEqual({});
  });

  it("styles: strong states get the strong ring, muted ones none, cancelled titles struck", () => {
    expect(calendarStateStyle("deal_closed").ring).toContain("ring-emerald-500/60");
    expect(calendarStateStyle("showed").ring).toBe("");
    expect(calendarStateStyle("showed").rail).toContain("bg-emerald-500/45");
    expect(calendarStateStyle("cancelled").title).toContain("line-through");
    expect(calendarStateStyle("unclaimed").card).toContain("border-dashed");
    expect(calendarStateStyle("upcoming").card).toBe("");
  });
});
