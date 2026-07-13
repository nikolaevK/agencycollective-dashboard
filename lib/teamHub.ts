import {
  buildClientDirectory,
  type ClientDirectoryRow,
} from "./clientDirectory";
import { effectiveMrrCents, setClientTeam } from "./clientProfile";
import type { RebillStatus } from "./clientBilling";
import { classifyRebill } from "./teamRebill";
import { businessTodayYmd } from "./businessTime";
import {
  listTeamMembers,
  getTeamMember,
  getGoalsCentsByAdmin,
  getGoalCents,
  listGoalHistory,
  listUnrosteredAssignees,
  type TeamMemberRecord,
  type UnrosteredAssignee,
} from "./teamMembers";
import {
  taskStatsByAdmin,
  emptyTaskStats,
  type TaskStats,
} from "./teamTasks";
import {
  unsolvedCountsByAdmin,
  runTeamSystemSweep,
} from "./teamActionItems";

// ---------------------------------------------------------------------------
// Team hub composition — the ONLY module that joins the Client Directory with
// the team workspace tables. Everything money is integer cents; every day
// comparison is a yyyy-mm-dd string on the business calendar
// (lib/businessTime.ts) — never the UTC server clock.
// ---------------------------------------------------------------------------

export type TeamTimeframe = "today" | "week" | "month";

export function parseTimeframe(value: unknown): TeamTimeframe {
  const s = String(value ?? "").trim();
  return s === "today" || s === "month" ? s : "week";
}

/**
 * The timeframe window [start, end] as ymd strings, starting at TODAY —
 * anything earlier is exactly the "overdue" bucket, counted separately so the
 * two never double-count. Week ends Sunday; month ends on the month's last day.
 */
export function timeframeWindow(
  timeframe: TeamTimeframe,
  todayYmd: string
): { start: string; end: string } {
  if (timeframe === "today") return { start: todayYmd, end: todayYmd };
  const d = new Date(`${todayYmd}T00:00:00Z`);
  if (timeframe === "week") {
    const daysToSunday = (7 - d.getUTCDay()) % 7;
    const end = new Date(d.getTime() + daysToSunday * 86_400_000);
    return { start: todayYmd, end: end.toISOString().slice(0, 10) };
  }
  const monthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { start: todayYmd, end: monthEnd.toISOString().slice(0, 10) };
}

// ---------------------------------------------------------------------------
// Client slices — the directory data each Team surface needs, slimmed down.
// ---------------------------------------------------------------------------

export interface TeamClientSlice {
  id: string;
  slug: string;
  displayName: string;
  logoPath: string | null;
  book: "agency" | "pepads";
  mrrCents: number; // effectiveMrrCents — pepads manual MRR respected
  isTop: boolean;
  health: string[]; // existing roster_options vocab slugs
  stages: string[];
  team: Array<{ adminId: string; role: string; name: string }>;
  /**
   * Computed re-bill facts — null for pepads (manually billed; the computed
   * schedule is meaningless there, mirroring the rebill-alerts exclusion).
   */
  rebill: {
    status: RebillStatus;
    nextRebillAt: string | null;
    paid: boolean;
  } | null;
  manualBilling: string[]; // pepads chips
  manualNextRebill: string | null; // pepads manual date
}

function toClientSlice(row: ClientDirectoryRow): TeamClientSlice {
  const isPepads = row.profile.book === "pepads";
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.displayName,
    logoPath: row.logoPath,
    book: row.profile.book,
    mrrCents: effectiveMrrCents(row),
    isTop: row.profile.isTop,
    health: row.profile.health,
    stages: row.profile.stages,
    team: row.team.map((t) => ({ adminId: t.adminId, role: t.role, name: t.name })),
    rebill: isPepads
      ? null
      : {
          status: row.schedule.status,
          nextRebillAt: row.schedule.nextRebillAt,
          paid: row.schedule.paid,
        },
    manualBilling: isPepads ? row.profile.manualBilling : [],
    manualNextRebill: isPepads ? row.profile.manualNextRebill : null,
  };
}

/** The active directory rows attributed to a member by their attribution rule. */
export function attributedClients(
  member: Pick<TeamMemberRecord, "adminId" | "attribution">,
  rows: ClientDirectoryRow[]
): ClientDirectoryRow[] {
  const active = rows.filter((r) => r.status === "active");
  if (member.attribution === "book") return active;
  return active.filter((r) =>
    r.team.some((t) => t.adminId === member.adminId && t.role === member.attribution)
  );
}

// ---------------------------------------------------------------------------
// Rebill rollups
// ---------------------------------------------------------------------------

export interface RebillRollup {
  inWindow: number;
  inWindowMrrCents: number;
  sentInWindow: number; // subset of inWindow already invoiced (dim in UI)
  overdue: number;
  overdueMrrCents: number;
  dueToday: number; // status === 'due', regardless of the timeframe window
}

function emptyRebillRollup(): RebillRollup {
  return {
    inWindow: 0,
    inWindowMrrCents: 0,
    sentInWindow: 0,
    overdue: 0,
    overdueMrrCents: 0,
    dueToday: 0,
  };
}

function rebillRollup(
  rows: ClientDirectoryRow[],
  window: { start: string; end: string }
): RebillRollup {
  const roll = emptyRebillRollup();
  for (const row of rows) {
    // PepAds are manually billed — excluded via the shared classifier (null).
    const bucket = classifyRebill(
      row.profile.book === "pepads" ? null : row.schedule,
      window
    );
    const mrr = effectiveMrrCents(row);
    if (bucket.overdue) {
      roll.overdue += 1;
      roll.overdueMrrCents += mrr;
    }
    if (bucket.inWindow) {
      roll.inWindow += 1;
      roll.inWindowMrrCents += mrr;
    }
    if (bucket.sent) roll.sentInWindow += 1;
    if (bucket.dueToday) roll.dueToday += 1;
  }
  return roll;
}

// ---------------------------------------------------------------------------
// Member summaries + Team directory
// ---------------------------------------------------------------------------

export interface TeamMemberSummary {
  adminId: string;
  name: string;
  position: string;
  attribution: TeamMemberRecord["attribution"];
  avatarPath: string | null;
  sortOrder: number;
  splitSharePercent: number | null;
  clientCount: number;
  mrrManagedCents: number;
  goalCents: number;
  healthCounts: Record<string, number>;
  zeroMrrActiveCount: number;
  rebills: RebillRollup;
  tasks: TaskStats;
  unsolvedActionItems: number;
}

export interface TeamDirectory {
  timeframe: TeamTimeframe;
  today: string;
  window: { start: string; end: string };
  members: TeamMemberSummary[];
  totals: {
    activeClients: number;
    bookMrrCents: number;
    healthCounts: Record<string, number>;
    unassignedActive: number;
    zeroMrrActive: number;
    rebills: RebillRollup;
    tasksDueInWindow: number; // incl. overdue (they always need attention)
    tasksOverdue: number;
    unsolvedActionItems: number;
  };
  /** Slim slices of every active client — powers the KPI drilldown panels. */
  clients: TeamClientSlice[];
  unrostered: UnrosteredAssignee[];
}

function healthCountsOf(rows: ClientDirectoryRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    for (const slug of row.profile.health) {
      counts[slug] = (counts[slug] ?? 0) + 1;
    }
  }
  return counts;
}

function summarizeMember(
  member: TeamMemberRecord,
  clients: ClientDirectoryRow[],
  window: { start: string; end: string },
  tasks: TaskStats,
  goalCents: number,
  unsolvedActionItems: number
): TeamMemberSummary {
  return {
    adminId: member.adminId,
    name: member.name,
    position: member.position,
    attribution: member.attribution,
    avatarPath: member.avatarPath,
    sortOrder: member.sortOrder,
    splitSharePercent: member.splitSharePercent,
    clientCount: clients.length,
    mrrManagedCents: clients.reduce((s, r) => s + effectiveMrrCents(r), 0),
    goalCents,
    healthCounts: healthCountsOf(clients),
    zeroMrrActiveCount: clients.filter((r) => effectiveMrrCents(r) === 0).length,
    rebills: rebillRollup(clients, window),
    tasks,
    unsolvedActionItems,
  };
}

export async function buildTeamDirectory(
  timeframe: TeamTimeframe
): Promise<TeamDirectory> {
  const today = businessTodayYmd();
  const window = timeframeWindow(timeframe, today);

  const rows = await buildClientDirectory();

  // The sweep reads the fresh rows and may create/solve system items — run it
  // BEFORE the stat queries so the KPIs reflect its output. Never fatal.
  try {
    await runTeamSystemSweep(rows);
  } catch (err) {
    console.error("[teamHub] system sweep failed", err);
  }

  const [members, taskStats, unsolvedCounts, goals, unrostered] =
    await Promise.all([
      listTeamMembers(),
      taskStatsByAdmin(today, window.end),
      unsolvedCountsByAdmin(),
      getGoalsCentsByAdmin(today.slice(0, 7)),
      listUnrosteredAssignees(),
    ]);

  const active = rows.filter((r) => r.status === "active");

  const summaries = members.map((member) =>
    summarizeMember(
      member,
      attributedClients(member, rows),
      window,
      taskStats.get(member.adminId) ?? emptyTaskStats(),
      goals.get(member.adminId) ?? 0,
      unsolvedCounts.get(member.adminId) ?? 0
    )
  );

  // Totals: task/action-item counts roll up ROSTERED members (each task
  // belongs to exactly one member, so summing summaries never double-counts).
  // dueInWindow is already bounded by this timeframe's window end (it is 0 on
  // "today", where the window collapses to [today, today]).
  let tasksDueInWindow = 0;
  let tasksOverdue = 0;
  let unsolvedTotal = 0;
  for (const s of summaries) {
    tasksOverdue += s.tasks.overdue;
    unsolvedTotal += s.unsolvedActionItems;
    tasksDueInWindow += s.tasks.overdue + s.tasks.dueToday + s.tasks.dueInWindow;
  }

  return {
    timeframe,
    today,
    window,
    members: summaries,
    totals: {
      activeClients: active.length,
      bookMrrCents: active.reduce((s, r) => s + effectiveMrrCents(r), 0),
      healthCounts: healthCountsOf(active),
      unassignedActive: active.filter((r) => r.team.length === 0).length,
      zeroMrrActive: active.filter((r) => effectiveMrrCents(r) === 0).length,
      rebills: rebillRollup(active, window),
      tasksDueInWindow,
      tasksOverdue,
      unsolvedActionItems: unsolvedTotal,
    },
    clients: active.map(toClientSlice),
    unrostered,
  };
}

// ---------------------------------------------------------------------------
// Single-member hub
// ---------------------------------------------------------------------------

export interface TeamMemberHub {
  member: TeamMemberRecord;
  timeframe: TeamTimeframe;
  today: string;
  summary: TeamMemberSummary;
  clients: TeamClientSlice[];
  goalMonth: string; // yyyy-mm this summary's goal applies to
  goalHistory: Array<{ month: string; goalCents: number }>;
}

export async function buildMemberHub(
  adminId: string,
  timeframe: TeamTimeframe
): Promise<TeamMemberHub | null> {
  const member = await getTeamMember(adminId);
  if (!member) return null;

  const today = businessTodayYmd();
  const window = timeframeWindow(timeframe, today);
  const goalMonth = today.slice(0, 7);

  const rows = await buildClientDirectory();
  const clients = attributedClients(member, rows);

  const [taskStats, unsolvedCounts, goalCents, goalHistory] = await Promise.all([
    taskStatsByAdmin(today, window.end, adminId),
    unsolvedCountsByAdmin(adminId),
    getGoalCents(adminId, goalMonth),
    listGoalHistory(adminId),
  ]);

  return {
    member,
    timeframe,
    today,
    summary: summarizeMember(
      member,
      clients,
      window,
      taskStats.get(adminId) ?? emptyTaskStats(),
      goalCents,
      unsolvedCounts.get(adminId) ?? 0
    ),
    clients: clients
      .map(toClientSlice)
      .sort((a, b) => b.mrrCents - a.mrrCents),
    goalMonth,
    goalHistory,
  };
}

// ---------------------------------------------------------------------------
// CSM auto-split — balance-assign the unclaimed active book across the
// CSM-attribution roster members. Assignments are MATERIALIZED as ordinary
// client_team rows (role 'csm') via the existing replace-set writer, so
// they're manually adjustable afterwards in the Client Directory.
// ---------------------------------------------------------------------------

export interface CsmSplitAssignment {
  clientId: string;
  clientName: string;
  mrrCents: number;
  adminId: string;
  adminName: string;
}

export async function autoSplitCsmBook(
  actor: { id: string },
  opts: { confirm: boolean }
): Promise<{ assignments: CsmSplitAssignment[]; applied: boolean }> {
  const [rows, members] = await Promise.all([
    buildClientDirectory(),
    listTeamMembers(),
  ]);
  // A member with an explicit 0% share has opted out of the split entirely.
  const targets = members.filter(
    (m) => m.attribution === "csm" && m.splitSharePercent !== 0
  );
  if (targets.length === 0) return { assignments: [], applied: false };

  // Weight = explicit share percent, else an equal slice. The D'Hondt greedy
  // below keeps final client counts proportional to these weights (60/40
  // shares → roughly 60/40 of the book), whatever they sum to.
  const equalShare = 100 / targets.length;
  const weightOf = new Map(
    targets.map((t) => [t.adminId, t.splitSharePercent ?? equalShare])
  );

  const active = rows.filter((r) => r.status === "active");

  // Seed each target's running load from EXISTING csm assignments so a
  // re-run balances incrementally instead of restarting from zero.
  const load = new Map<string, { count: number; mrr: number }>(
    targets.map((t) => [t.adminId, { count: 0, mrr: 0 }])
  );
  for (const row of active) {
    for (const t of row.team) {
      if (t.role !== "csm") continue;
      const l = load.get(t.adminId);
      if (l) {
        l.count += 1;
        l.mrr += effectiveMrrCents(row);
      }
    }
  }

  // Candidates: active clients with no CSM yet, biggest books first — greedy
  // to the lightest target balances both count and managed MRR.
  const candidates = active
    .filter((r) => !r.team.some((t) => t.role === "csm"))
    .sort((a, b) => effectiveMrrCents(b) - effectiveMrrCents(a));

  const assignments: CsmSplitAssignment[] = [];
  for (const client of candidates) {
    // Next client goes to the target with the highest weight/(count+1)
    // quotient (D'Hondt) — proportional allocation; ties break to the
    // lighter managed-MRR book.
    let best = targets[0];
    let bestLoad = load.get(best.adminId)!;
    let bestScore = weightOf.get(best.adminId)! / (bestLoad.count + 1);
    for (const t of targets.slice(1)) {
      const l = load.get(t.adminId)!;
      const score = weightOf.get(t.adminId)! / (l.count + 1);
      if (score > bestScore || (score === bestScore && l.mrr < bestLoad.mrr)) {
        best = t;
        bestLoad = l;
        bestScore = score;
      }
    }
    const mrr = effectiveMrrCents(client);
    bestLoad.count += 1;
    bestLoad.mrr += mrr;
    assignments.push({
      clientId: client.id,
      clientName: client.displayName,
      mrrCents: mrr,
      adminId: best.adminId,
      adminName: best.name,
    });
  }

  if (opts.confirm) {
    for (const a of assignments) {
      await setClientTeam(a.clientId, "csm", [a.adminId], actor.id);
    }
  }

  return { assignments, applied: opts.confirm };
}
