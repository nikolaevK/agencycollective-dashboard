"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { X, UserPlus, Settings2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { classifyRebill, monthlyHeadline } from "@/lib/teamRebill";
import { formatMoney, formatDate } from "@/components/users/format";
import { AvatarInitials } from "@/components/users/AvatarInitials";
import { useRosterOptions } from "@/hooks/useRosterOptions";
import { HEALTH_CHIP_CLS, FALLBACK_CHIP_CLS, CHIP_BASE } from "@/components/users/rosterPresentation";
import { useTeamDirectory } from "./useTeamData";
import { RosterManageDialog } from "./RosterManageDialog";
import { MonthlyRebillTracker } from "./MonthlyRebillTracker";
import {
  TIMEFRAME_OPTIONS,
  TIMEFRAME_PHRASE,
  ATTRIBUTION_LABEL,
  avatarTint,
  monthName,
} from "./presentation";
import type {
  TeamDirectoryPayload,
  TeamMemberSummary,
  TeamClientSlice,
  TeamTimeframeValue,
} from "./types";

type DrillKind =
  | "mrr"
  | "health"
  | "rebills"
  | "collected"
  | "tasksdue"
  | "overdue"
  | "actions";

export function TeamHome() {
  const [timeframe, setTimeframe] = useState<TeamTimeframeValue>("week");
  const [drill, setDrill] = useState<DrillKind | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [managePreselect, setManagePreselect] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useTeamDirectory(timeframe);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-24 rounded-xl bg-muted/40 animate-pulse" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-56 rounded-xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
        Failed to load the Team directory.{" "}
        <button className="text-primary font-semibold" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }

  const tfl = TIMEFRAME_PHRASE[timeframe];

  return (
    <div className="space-y-5">
      {/* Header row: timeframe + roster manage */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          {TIMEFRAME_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setTimeframe(o.value)}
              className={cn(
                "px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors",
                timeframe === o.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        {data.viewer.privileged && (
          <button
            type="button"
            onClick={() => setManageOpen(true)}
            className="inline-flex items-center gap-2 h-9 rounded-lg border border-border px-3.5 text-sm font-semibold text-foreground hover:bg-accent transition-colors"
          >
            <Settings2 className="h-4 w-4" />
            Manage roster
          </button>
        )}
      </div>

      <KpiStrip data={data} tfl={tfl} drill={drill} onDrill={setDrill} />

      {drill && <DrillPanel data={data} kind={drill} tfl={tfl} onClose={() => setDrill(null)} />}

      {data.unrostered.length > 0 && (
        <UnrosteredNotice
          data={data}
          onAdd={(adminId) => {
            setManagePreselect(adminId);
            setManageOpen(true);
          }}
        />
      )}

      {data.members.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-sm font-semibold text-foreground">No team members yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            {data.viewer.privileged
              ? "Add admins to the roster to build their hubs."
              : "An admin needs to set up the roster."}
          </p>
          {data.viewer.privileged && (
            <button
              type="button"
              onClick={() => setManageOpen(true)}
              className="mt-4 inline-flex items-center gap-2 h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <UserPlus className="h-4 w-4" />
              Add team member
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.members.map((m) => (
            <MemberCard
              key={m.adminId}
              member={m}
              tfl={tfl}
              timeframe={timeframe}
              viewer={data.viewer}
            />
          ))}
        </div>
      )}

      {manageOpen && (
        <RosterManageDialog
          directory={data}
          initialAdminId={managePreselect}
          onClose={() => {
            setManageOpen(false);
            setManagePreselect(null);
          }}
        />
      )}
    </div>
  );
}

/* ── KPI strip ─────────────────────────────────────────────────────────── */

function KpiStrip({
  data,
  tfl,
  drill,
  onDrill,
}: {
  data: TeamDirectoryPayload;
  tfl: string;
  drill: DrillKind | null;
  onDrill: (k: DrillKind | null) => void;
}) {
  const t = data.totals;
  // Count CLIENTS with any health chip (not chip instances) so the tile
  // matches the drill list length exactly.
  const healthFlagged = data.clients.filter((c) => c.health.length > 0).length;
  // Team-level collected = the whole-book Payout-DB aggregate (all re-billed
  // revenue this month), falling back to the bucket sum if absent.
  const collected = monthlyHeadline(t.monthly);
  const tiles: {
    kind: DrillKind;
    label: string;
    value: string;
    sub: string;
    tone?: "green" | "amber" | "red";
  }[] = [
    {
      kind: "mrr",
      label: "Book MRR",
      value: formatMoney(t.bookMrrCents),
      sub: `across ${t.activeClients} active clients`,
      tone: "green",
    },
    {
      kind: "health",
      label: "Client Health",
      value: String(healthFlagged),
      sub: "clients with health chips",
    },
    {
      kind: "rebills",
      label: `Rebills · ${tfl}`,
      value: `${t.rebills.inWindow}`,
      sub:
        t.rebills.overdue > 0
          ? `${t.rebills.overdue} overdue · ${formatMoney(t.rebills.overdueMrrCents)} ⚠`
          : formatMoney(t.rebills.inWindowMrrCents),
      tone: t.rebills.overdue > 0 ? "red" : undefined,
    },
    {
      kind: "collected",
      label: `Re-billed · ${monthName(t.monthly.month)}`,
      value: formatMoney(collected.cents),
      // "all rebills" qualifies the mixed populations: the aggregate spans
      // the whole Payout DB while book MRR is active-directory only.
      sub:
        t.bookMrrCents > 0
          ? `${Math.round((collected.cents / t.bookMrrCents) * 100)}% of book MRR · all rebills`
          : "all rebills this month",
      tone: "green",
    },
    {
      kind: "tasksdue",
      label: `Tasks Due · ${tfl}`,
      value: String(t.tasksDueInWindow),
      sub: `${t.tasksOverdue} overdue included`,
      tone: t.tasksDueInWindow > 0 ? "amber" : undefined,
    },
    {
      kind: "overdue",
      label: "Overdue Tasks",
      value: String(t.tasksOverdue),
      sub: "needs attention",
      tone: t.tasksOverdue > 0 ? "red" : undefined,
    },
    {
      kind: "actions",
      label: "Action Items",
      value: String(t.unsolvedActionItems),
      sub: "unsolved",
      tone: t.unsolvedActionItems > 0 ? "red" : undefined,
    },
  ];

  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
      {tiles.map((tile) => (
        <button
          key={tile.kind}
          type="button"
          onClick={() => onDrill(drill === tile.kind ? null : tile.kind)}
          className={cn(
            "rounded-xl border p-3.5 text-left transition-colors",
            drill === tile.kind
              ? "border-primary ring-2 ring-primary/20 bg-primary/[0.03]"
              : "border-border/60 bg-card hover:border-primary/50"
          )}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {tile.label}
          </p>
          <p
            className={cn(
              "text-xl font-black mt-1 leading-none",
              tile.tone === "green" && "text-emerald-600 dark:text-emerald-400",
              tile.tone === "amber" && "text-amber-600 dark:text-amber-400",
              tile.tone === "red" && "text-red-600 dark:text-red-400"
            )}
          >
            {tile.value}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1 truncate">{tile.sub}</p>
        </button>
      ))}
    </div>
  );
}

/* ── Drilldown panel ───────────────────────────────────────────────────── */

function DrillPanel({
  data,
  kind,
  tfl,
  onClose,
}: {
  data: TeamDirectoryPayload;
  kind: DrillKind;
  tfl: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { labels: healthLabels } = useRosterOptions("health");
  const titles: Record<DrillKind, string> = {
    mrr: "MRR managed by member",
    health: "Client health",
    rebills: `Rebills · ${tfl}`,
    collected: `Re-billed · ${monthName(data.totals.monthly.month)} · by member`,
    tasksdue: `Tasks due · ${tfl}`,
    overdue: "Overdue tasks by member",
    actions: "Unsolved action items by member",
  };

  const memberRow = (m: TeamMemberSummary, right: React.ReactNode) => (
    <button
      key={m.adminId}
      type="button"
      onClick={() => router.push(`/dashboard/team/${m.adminId}`)}
      className="flex w-full items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted/40 text-left"
    >
      <MemberAvatar name={m.name} avatarPath={m.avatarPath} size="sm" />
      <span className="text-sm font-semibold text-foreground flex-1 truncate">{m.name}</span>
      {right}
    </button>
  );

  const clientRow = (c: TeamClientSlice, right: React.ReactNode) => (
    <div key={c.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted/40">
      <AvatarInitials name={c.displayName} className="w-7 h-7" />
      <span className="text-sm font-semibold text-foreground flex-1 truncate">
        {c.displayName}
      </span>
      {right}
    </div>
  );

  let body: React.ReactNode = null;
  if (kind === "mrr") {
    body = data.members.map((m) =>
      memberRow(
        m,
        <span className="text-sm font-bold">
          {formatMoney(m.mrrManagedCents)}
          <span className="ml-2 text-[11px] font-semibold text-muted-foreground">
            {m.clientCount} clients
          </span>
        </span>
      )
    );
  } else if (kind === "collected") {
    // Same headline resolution the member cards render (monthlyHeadline) —
    // the drill always matches the bars. Whole-book members show the
    // all-book Payout-DB aggregate.
    const anyWholeBook = data.members.some(
      (m) => monthlyHeadline(m.monthly).wholeBook
    );
    body = (
      <>
        {data.members.map((m) => {
          const h = monthlyHeadline(m.monthly);
          const pct =
            m.mrrManagedCents > 0
              ? Math.round((h.cents / m.mrrManagedCents) * 100)
              : null;
          return memberRow(
            m,
            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
              {formatMoney(h.cents)}
              <span className="ml-2 text-[11px] font-semibold text-muted-foreground">
                {h.wholeBook && "all book · "}
                {pct !== null ? `${pct}% of MRR` : "no MRR"}
                {m.goalCents > 0 &&
                  ` · ${Math.round((h.cents / m.goalCents) * 100)}% of goal`}
              </span>
            </span>
          );
        })}
        {anyWholeBook && (
          <p className="px-2 pt-2 text-[10px] text-muted-foreground">
            &ldquo;All book&rdquo; rows show the same whole-book total — the
            column is not additive.
          </p>
        )}
      </>
    );
  } else if (kind === "health") {
    const flagged = data.clients
      .filter((c) => c.health.length > 0)
      .sort((a, b) => b.mrrCents - a.mrrCents);
    body = flagged.length
      ? flagged.map((c) =>
          clientRow(
            c,
            <span className="flex items-center gap-1 flex-wrap justify-end">
              {c.health.map((h) => (
                <span key={h} className={cn(CHIP_BASE, HEALTH_CHIP_CLS[h] ?? FALLBACK_CHIP_CLS)}>
                  {healthLabels[h] ?? h}
                </span>
              ))}
            </span>
          )
        )
      : <Empty text="No health chips set on the book yet" />;
  } else if (kind === "rebills") {
    // Same classifier the server rollup uses — the list always matches the tile.
    const buckets = data.clients.map(
      (c) => [c, classifyRebill(c.rebill, data.window)] as const
    );
    const inWindow = buckets
      .filter(([, b]) => b.inWindow)
      .sort(([a], [b]) => (a.rebill!.nextRebillAt! < b.rebill!.nextRebillAt! ? -1 : 1));
    const overdue = buckets.filter(([, b]) => b.overdue).map(([c]) => c);
    body = (
      <>
        {overdue.length > 0 && (
          <p className="px-2 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
            Overdue · {overdue.length}
          </p>
        )}
        {overdue.map((c) =>
          clientRow(
            c,
            <span className="text-xs font-bold text-red-600 dark:text-red-400">
              {formatMoney(c.mrrCents)} · {formatDate(c.rebill?.nextRebillAt)}
            </span>
          )
        )}
        {inWindow.length > 0 && (
          <p className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Due {tfl} · {inWindow.length}
          </p>
        )}
        {inWindow.map(([c, b]) =>
          clientRow(
            c,
            <span
              className={cn(
                "text-xs font-semibold text-muted-foreground",
                b.sent && "opacity-60"
              )}
            >
              {formatMoney(c.mrrCents)} · {formatDate(c.rebill?.nextRebillAt)}
              {b.sent && " · sent"}
            </span>
          )
        )}
        {overdue.length === 0 && inWindow.length === 0 && (
          <Empty text={`No rebills ${tfl} 🎉`} />
        )}
      </>
    );
  } else if (kind === "tasksdue") {
    // Same buckets the tile sums (overdue + dueToday + dueInWindow) — the
    // panel members always add up to the tile count for this timeframe.
    body = data.members
      .filter((m) => m.tasks.overdue + m.tasks.dueToday + m.tasks.dueInWindow > 0)
      .map((m) =>
        memberRow(
          m,
          <span className="text-xs font-semibold text-muted-foreground">
            {m.tasks.overdue > 0 && (
              <span className="text-red-600 dark:text-red-400 font-bold mr-2">
                {m.tasks.overdue} overdue
              </span>
            )}
            {m.tasks.dueToday} today
            {data.timeframe !== "today" && ` · ${m.tasks.dueInWindow} later ${tfl}`}
          </span>
        )
      );
    if (!Array.isArray(body) || body.length === 0) body = <Empty text={`Nothing due ${tfl} 🎉`} />;
  } else if (kind === "overdue") {
    const rows = data.members.filter((m) => m.tasks.overdue > 0);
    body = rows.length
      ? rows.map((m) =>
          memberRow(
            m,
            <span className="text-sm font-bold text-red-600 dark:text-red-400">
              {m.tasks.overdue}
            </span>
          )
        )
      : <Empty text="Nothing overdue 🎉" />;
  } else {
    const rows = data.members.filter((m) => m.unsolvedActionItems > 0);
    body = rows.length
      ? rows.map((m) =>
          memberRow(
            m,
            <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
              {m.unsolvedActionItems}
            </span>
          )
        )
      : <Empty text="Inbox zero 🎉" />;
  }

  return (
    <div className="rounded-xl border border-primary/50 bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-foreground">{titles[kind]}</h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-muted-foreground hover:text-foreground"
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-80 overflow-y-auto">{body}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-2 py-6 text-center text-sm text-muted-foreground">{text}</p>;
}

/* ── Member card ───────────────────────────────────────────────────────── */

export function MemberAvatar({
  name,
  avatarPath,
  size = "md",
}: {
  name: string;
  avatarPath: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const px = size === "sm" ? 28 : size === "md" ? 44 : 56;
  const cls =
    size === "sm" ? "w-7 h-7 text-[10px]" : size === "md" ? "w-11 h-11 text-sm" : "w-14 h-14 text-lg";
  if (avatarPath) {
    return (
      <span className={cn("relative rounded-xl overflow-hidden shrink-0", cls)}>
        <Image src={avatarPath} alt="" width={px} height={px} className="h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-xl font-bold text-white shrink-0",
        avatarTint(name),
        cls
      )}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

const WINDOW_STAT_LABEL: Record<TeamTimeframeValue, string> = {
  today: "In Window",
  week: "This Wk",
  month: "This Mo",
};

function MemberCard({
  member: m,
  tfl,
  timeframe,
  viewer,
}: {
  member: TeamMemberSummary;
  tfl: string;
  timeframe: TeamTimeframeValue;
  viewer: { adminId: string; privileged: boolean };
}) {
  const router = useRouter();
  const { labels: healthLabels } = useRosterOptions("health");
  const canOpen = viewer.privileged || viewer.adminId === m.adminId;
  const topHealth = useMemo(
    () =>
      Object.entries(m.healthCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3),
    [m.healthCounts]
  );

  return (
    // Not `disabled` — a disabled button swallows hover, so the title tooltip
    // explaining WHY it can't be opened would never show.
    <button
      type="button"
      aria-disabled={!canOpen}
      onClick={() => canOpen && router.push(`/dashboard/team/${m.adminId}`)}
      title={canOpen ? undefined : "Only admins with Admin Management access can open other members' hubs"}
      className={cn(
        "rounded-xl border border-border/60 bg-card p-4 text-left transition-all",
        canOpen
          ? "hover:border-primary hover:-translate-y-0.5 cursor-pointer"
          : "opacity-80 cursor-default"
      )}
    >
      <div className="flex items-center gap-3">
        <MemberAvatar name={m.name} avatarPath={m.avatarPath} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground truncate">{m.name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {m.position || ATTRIBUTION_LABEL[m.attribution]} · {m.clientCount} clients
          </p>
        </div>
        {topHealth.length > 0 && (
          <span className="flex items-center gap-1 shrink-0">
            {topHealth.map(([slug, count]) => (
              <span
                key={slug}
                className={cn(CHIP_BASE, HEALTH_CHIP_CLS[slug] ?? FALLBACK_CHIP_CLS)}
                title={healthLabels[slug] ?? slug}
              >
                {count}
              </span>
            ))}
          </span>
        )}
      </div>

      {/* The monthly goal is a re-bill COLLECTION target — it's compared
          against collected in the tracker below, never against MRR managed. */}
      <div className="mt-3 flex items-baseline gap-2 flex-wrap">
        <span className="text-lg font-black text-foreground">
          {formatMoney(m.mrrManagedCents)}
        </span>
        <span className="text-[11px] text-muted-foreground">MRR managed</span>
      </div>

      <MonthlyRebillTracker
        monthly={m.monthly}
        mrrManagedCents={m.mrrManagedCents}
        goalCents={m.goalCents}
        retention={m.retention}
        className="mt-2.5 rounded-lg bg-muted/40 px-3 py-2.5"
      />

      {/* Timeframe-scoped window strip — the month tracker above doesn't
          answer "what lands {tfl}?", so this keeps the toggle meaningful. */}
      <div className="mt-2 flex items-center gap-2 flex-wrap rounded-lg bg-muted/40 px-3 py-2 text-xs">
        <span className="font-bold text-foreground">
          {m.rebills.inWindow} rebill{m.rebills.inWindow === 1 ? "" : "s"}
        </span>
        <span className="text-muted-foreground">
          · {formatMoney(m.rebills.inWindowMrrCents)} · {tfl}
        </span>
        {m.rebills.sentInWindow > 0 && (
          <span className="text-muted-foreground/60 font-semibold">
            {m.rebills.sentInWindow} sent
          </span>
        )}
        {m.rebills.overdue > 0 && (
          <span className="ml-auto rounded-md bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400">
            {m.rebills.overdue} overdue
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 min-[400px]:grid-cols-4">
        <StatTile label="Overdue" value={m.tasks.overdue} tone={m.tasks.overdue > 0 ? "red" : undefined} />
        <StatTile label="Today" value={m.tasks.dueToday} tone={m.tasks.dueToday > 0 ? "amber" : undefined} />
        <StatTile label={WINDOW_STAT_LABEL[timeframe]} value={m.tasks.dueInWindow} tone="blue" />
        <StatTile label="Done" value={m.tasks.done} tone="green" />
      </div>

      {m.unsolvedActionItems > 0 && (
        <p className="mt-2.5 flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3" />
          {m.unsolvedActionItems} unsolved action item{m.unsolvedActionItems === 1 ? "" : "s"}
        </p>
      )}
    </button>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "red" | "amber" | "blue" | "green";
}) {
  return (
    <div className="rounded-lg bg-muted/40 px-1.5 py-2 text-center">
      <p
        className={cn(
          "text-sm font-black leading-none",
          tone === "red" && "text-red-600 dark:text-red-400",
          tone === "amber" && "text-amber-600 dark:text-amber-400",
          tone === "blue" && "text-blue-600 dark:text-blue-400",
          tone === "green" && "text-emerald-600 dark:text-emerald-400",
          !tone && "text-foreground"
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

/* ── Unrostered assignees notice ───────────────────────────────────────── */

function UnrosteredNotice({
  data,
  onAdd,
}: {
  data: TeamDirectoryPayload;
  onAdd: (adminId: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 flex-wrap">
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <p className="text-xs text-foreground">
        <span className="font-bold">
          {data.unrostered.length} assignee{data.unrostered.length === 1 ? "" : "s"}
        </span>{" "}
        hold client assignments but aren&apos;t on the Team roster:
      </p>
      <span className="flex items-center gap-1.5 flex-wrap flex-1">
        {data.unrostered.map((u) =>
          data.viewer.privileged ? (
            <button
              key={u.adminId}
              type="button"
              onClick={() => onAdd(u.adminId)}
              className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 px-2 py-0.5 text-[11px] font-bold text-foreground hover:bg-amber-500/10"
              title={`Add ${u.name} to the roster`}
            >
              <UserPlus className="h-3 w-3" />
              {u.name} ({u.clientCount})
            </button>
          ) : (
            <span key={u.adminId} className="text-[11px] font-semibold text-foreground">
              {u.name} ({u.clientCount})
            </span>
          )
        )}
      </span>
    </div>
  );
}
