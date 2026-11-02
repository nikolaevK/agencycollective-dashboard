// ---------------------------------------------------------------------------
// Team hub trend series — pure, NO db imports (safe for "use client").
// The server (lib/teamHub.ts buildTeamTrends / buildMemberTrends) folds REBILL
// payouts, monthly goals and task timestamps into fixed windows; the Team
// pages draw them as card trend lines and charts. Read-only history: nothing
// here feeds a rollup or a headline (those stay in lib/teamRebill.ts).
// ---------------------------------------------------------------------------

/** One roster member's history, aligned to TeamTrends.months / .weeks. */
export interface MemberTrendSeries {
  adminId: string;
  /** Σ amount_due of REBILL-flagged payouts per month (cents). Whole-book
   *  members get the whole Payout DB (the same rows as their headline);
   *  everyone else the payouts of the clients attributed to them today. */
  rebilled: number[];
  /** Σ amount_due of ALL payouts per month of the clients attributed to the
   *  member today — the Client Directory MRR card's "Billed per month" line
   *  (MRR itself has no history: it's the latest payout month, live). */
  billed: number[];
  /** The month's goal in cents (carry-forward: the latest goal set at or
   *  before that month; 0 = no goal yet). */
  goals: number[];
  /** Tasks created per week (business-timezone Monday–Sunday weeks). */
  tasksCreated: number[];
  /** Tasks completed per week (by completed_at). */
  tasksCompleted: number[];
}

export interface TeamTrends {
  /** "yyyy-mm", oldest first, ending with the current business month. */
  months: string[];
  /** "yyyy-mm-dd" Mondays, oldest first, ending with the current week. */
  weeks: string[];
  members: MemberTrendSeries[];
  /** Σ over `members` — except `billed` (the totals' clients, like Book MRR)
   *  and `rebilled`, which is the whole Payout DB when
   *  the page's re-billed headline is (`wholeBook`). `goals` is a plain sum:
   *  members' goals overlap (an Entire-book member's goal covers everyone's
   *  clients), so it only means "the goal" for a single-member payload. */
  totals: Omit<MemberTrendSeries, "adminId"> & { wholeBook: boolean };
}

export const TREND_WEEKS = 12;

const DAY_MS = 86_400_000;

/**
 * `count` consecutive weeks (Monday start dates, yyyy-mm-dd) ending with the
 * week containing `todayYmd` — the Team hub's week runs Monday–Sunday
 * (lib/teamHub.ts timeframeWindow ends the week on Sunday).
 */
export function trendWeeks(todayYmd: string, count: number = TREND_WEEKS): string[] {
  const today = new Date(`${todayYmd}T00:00:00Z`);
  const sinceMonday = (today.getUTCDay() + 6) % 7;
  const monday = today.getTime() - sinceMonday * DAY_MS;
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    out.push(new Date(monday - i * 7 * DAY_MS).toISOString().slice(0, 10));
  }
  return out;
}

/** Index of the week (from trendWeeks) containing `ymd`, or -1 outside the window. */
export function weekIndexOf(ymd: string, weeks: string[]): number {
  if (weeks.length === 0 || ymd < weeks[0]) return -1;
  const days = Math.floor(
    (new Date(`${ymd}T00:00:00Z`).getTime() - new Date(`${weeks[0]}T00:00:00Z`).getTime()) / DAY_MS
  );
  const i = Math.floor(days / 7);
  return i < weeks.length ? i : -1;
}

/**
 * Tasks created / completed per week. Each task contributes its business-day
 * dates (null = not completed); days outside the window are ignored.
 */
export function foldTaskWeeks(
  tasks: ReadonlyArray<{ createdYmd: string | null; completedYmd: string | null }>,
  weeks: string[]
): { created: number[]; completed: number[] } {
  const created = weeks.map(() => 0);
  const completed = weeks.map(() => 0);
  for (const t of tasks) {
    const c = t.createdYmd ? weekIndexOf(t.createdYmd, weeks) : -1;
    if (c >= 0) created[c] += 1;
    const d = t.completedYmd ? weekIndexOf(t.completedYmd, weeks) : -1;
    if (d >= 0) completed[d] += 1;
  }
  return { created, completed };
}

/**
 * A member's goal for each month, carried forward like the hub's goal read
 * (lib/teamMembers.ts getGoalsCentsByAdmin): a month without its own row
 * inherits the latest earlier one. `rows` may come in any order.
 */
export function carryForwardGoals(
  rows: ReadonlyArray<{ month: string; goalCents: number }>,
  months: string[]
): number[] {
  const sorted = [...rows].sort((a, b) => a.month.localeCompare(b.month));
  return months.map((ym) => {
    let goal = 0;
    for (const r of sorted) {
      if (r.month > ym) break;
      goal = r.goalCents;
    }
    return goal;
  });
}

/** Element-wise sum of aligned series (all the same length as `length`). */
export function sumAligned(series: ReadonlyArray<ReadonlyArray<number>>, length: number): number[] {
  const out = Array.from({ length }, () => 0);
  for (const s of series) s.forEach((v, i) => (out[i] += v));
  return out;
}
