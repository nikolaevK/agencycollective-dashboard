"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { BarChart3, Crown, Layers, UserPlus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Skeleton } from "@/components/ui/skeleton";
import { RebillCollectionCard } from "@/components/overview/RebillProgress";
import { useRosterOptions } from "@/hooks/useRosterOptions";
import { useAdPlatformOptions } from "@/hooks/useAdPlatformOptions";
import { buildMonthlyRebillProgress, monthlyRetentionOf } from "@/lib/teamRebill";
import { joinedByMonth, sumSeries, trendMonths, type ClientTrends } from "@/lib/clientTrendSeries";
import { cn } from "@/lib/utils";
import { effectiveMrrCents, SERVICE_LABELS } from "./rosterPresentation";
import { formatMoney } from "./format";
import type { ClientPublic } from "./types";

const monthDate = (ym: string) => parseISO(`${ym}-01`);
const pctOf = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

interface ClientInsightsProps {
  /** The clients in the page's workspace context (every status). */
  clients: ClientPublic[];
  trends?: ClientTrends;
  trendsError?: boolean;
  /** "yyyy-mm" business month the page describes. */
  month: string;
  /** "All books" / the selected workspace's name. */
  scopeLabel: string;
}

/**
 * Directory insights: 12-month client revenue (Payout DB), this month's
 * re-bill collection, where MRR sits (stage / health / service / team), the
 * biggest clients and new clients per month. Everything follows the page's
 * workspace context; MRR figures count ACTIVE clients only, like the MRR card.
 */
export function ClientInsights({ clients, trends, trendsError, month, scopeLabel }: ClientInsightsProps) {
  const active = useMemo(() => clients.filter((c) => c.status === "active"), [clients]);
  const mrrTotal = useMemo(() => active.reduce((s, c) => s + effectiveMrrCents(c), 0), [active]);
  const monthly = useMemo(
    () =>
      buildMonthlyRebillProgress(
        active.map((c) => ({
          rebill: c.profile.book === "pepads" ? null : c.schedule,
          mrrCents: effectiveMrrCents(c),
        })),
        month
      ),
    [active, month]
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ClientRevenueChart clients={clients} trends={trends} failed={trendsError} className="lg:col-span-2" />
        <RebillCollectionCard
          monthly={monthly}
          mrrCents={mrrTotal}
          retention={monthlyRetentionOf(monthly)}
          href="/dashboard/team"
          scopeLabel={scopeLabel === "All clients" ? "Active clients" : `Active clients · ${scopeLabel}`}
        />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 2xl:grid-cols-3">
        <MrrBreakdownCard active={active} mrrTotal={mrrTotal} />
        <TopClientsCard active={active} mrrTotal={mrrTotal} />
        <NewClientsChart clients={clients} months={trends?.months ?? trendMonths(month)} className="lg:col-span-2 2xl:col-span-1" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Client revenue — 12 months of payouts for these clients
// ---------------------------------------------------------------------------

// Same marks as the Payout Tracker's revenue mix: rebill = chart-4, other
// billing = chart-1, collected = a neutral line (a different mark, no 3rd hue).
const revenueConfig = {
  rebill: { label: "Re-bill", color: "hsl(var(--chart-4))" },
  other: { label: "Other billing", color: "hsl(var(--chart-1))" },
  collected: { label: "Collected", color: "hsl(var(--foreground))" },
} satisfies ChartConfig;
type RevenueKey = keyof typeof revenueConfig;

function ClientRevenueChart({
  clients,
  trends,
  failed,
  className,
}: {
  clients: ClientPublic[];
  trends?: ClientTrends;
  failed?: boolean;
  className?: string;
}) {
  const data = useMemo(() => {
    if (!trends) return null;
    const ids = new Set(clients.map((c) => c.id));
    const billed = sumSeries(trends, "billed", ids);
    const rebilled = sumSeries(trends, "rebilled", ids);
    const collected = sumSeries(trends, "collected", ids);
    return trends.months.map((ym, i) => ({
      key: ym,
      label: format(monthDate(ym), "MMM"),
      title: format(monthDate(ym), "MMMM yyyy"),
      billed: billed[i],
      rebill: Math.min(rebilled[i], billed[i]),
      other: Math.max(billed[i] - rebilled[i], 0),
      collected: collected[i],
    }));
  }, [clients, trends]);
  type Datum = NonNullable<typeof data>[number];
  const hasData = data?.some((d) => d.billed > 0 || d.collected > 0) ?? false;
  const last = (data?.length ?? 0) - 1;
  const STACK = ["rebill", "other"] as const;
  const cellsFor = (series: (typeof STACK)[number]) =>
    (data ?? []).map((d, i) => {
      const top = [...STACK].reverse().find((k) => d[k] > 0);
      return (
        <Cell
          key={d.key}
          fillOpacity={i === last ? 1 : 0.7}
          radius={(top === series ? [6, 6, 0, 0] : 0) as unknown as number}
        />
      );
    });

  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader className="flex flex-col gap-1 space-y-0 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-4 text-muted-foreground" />
          <CardTitle>Client Revenue</CardTitle>
        </div>
        <CardDescription className="text-xs">Payout DB · last 12 months</CardDescription>
      </CardHeader>
      <CardContent>
        {!data ? (
          failed ? (
            <p className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
              Couldn&apos;t load the revenue history.
            </p>
          ) : (
            <Skeleton className="h-[300px] w-full rounded-2xl" />
          )
        ) : !hasData ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No payouts for these clients in the last 12 months.</p>
        ) : (
          <ChartContainer config={revenueConfig} className="aspect-auto h-[300px] w-full">
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickFormatter={(v: number) => formatMoney(v)} tickLine={false} axisLine={false} width={72} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => {
                      const d = payload?.[0]?.payload as Datum | undefined;
                      return d ? `${d.title} · ${formatMoney(d.billed)} billed` : null;
                    }}
                    formatter={(value, name) => {
                      const key = name as RevenueKey;
                      return (
                        <>
                          <div
                            className="h-2.5 w-2.5 shrink-0 rounded-[2px] bg-[--color-bg]"
                            style={{ "--color-bg": `var(--color-${key})` } as React.CSSProperties}
                          />
                          <div className="flex flex-1 items-center justify-between gap-4 leading-none">
                            <span className="text-muted-foreground">{revenueConfig[key]?.label}</span>
                            <span className="font-mono font-medium tabular-nums text-foreground">
                              {formatMoney(Number(value))}
                            </span>
                          </div>
                        </>
                      );
                    }}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              {/* 2px card-colored stroke = the gap between stacked segments. */}
              <Bar dataKey="rebill" stackId="mix" fill="var(--color-rebill)" stroke="hsl(var(--card))" strokeWidth={2} maxBarSize={40} animationDuration={600}>
                {cellsFor("rebill")}
              </Bar>
              <Bar dataKey="other" stackId="mix" fill="var(--color-other)" stroke="hsl(var(--card))" strokeWidth={2} maxBarSize={40} animationDuration={600}>
                {cellsFor("other")}
              </Bar>
              <Line
                dataKey="collected"
                type="monotone"
                stroke="var(--color-collected)"
                strokeWidth={2}
                animationDuration={600}
                dot={{ r: 3, fill: "var(--color-collected)", stroke: "hsl(var(--card))", strokeWidth: 2 }}
                activeDot={{ r: 4.5, fill: "var(--color-collected)", stroke: "hsl(var(--card))", strokeWidth: 2 }}
              />
            </ComposedChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Ranked bars (Payout Insights look)
// ---------------------------------------------------------------------------

interface RankedRow {
  key: string;
  name: string;
  value: string;
  detail: string;
  /** Bar length, 0–100. */
  pct: number;
  muted?: boolean;
  href?: string;
}

function RankedBars({ rows, barClass }: { rows: RankedRow[]; barClass: string }) {
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className={cn("truncate", r.muted ? "text-muted-foreground" : "font-medium")}>{r.name}</span>
              <span className="shrink-0 tabular-nums">
                <span className="font-medium">{r.value}</span>
                <span className="ml-1.5 text-xs text-muted-foreground">{r.detail}</span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", r.muted ? "bg-muted-foreground/40" : barClass)}
                style={{ width: `${Math.max(r.pct, 1)}%` }}
              />
            </div>
          </>
        );
        return (
          <li key={r.key}>
            {r.href ? (
              <Link
                href={r.href}
                prefetch={false}
                className="-mx-2 block space-y-1.5 rounded-xl px-2 py-1 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/30"
              >
                {body}
              </Link>
            ) : (
              <div className="space-y-1.5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Where MRR sits — by stage / health / service / media buyer
// ---------------------------------------------------------------------------

type Dimension = "stage" | "health" | "service" | "platform" | "buyer";
const DIMENSIONS: { value: Dimension; label: string }[] = [
  { value: "stage", label: "Stage" },
  { value: "health", label: "Health" },
  { value: "service", label: "Service" },
  { value: "platform", label: "Platform" },
  { value: "buyer", label: "Media buyer" },
];
const SHOWN_GROUPS = 7;

function MrrBreakdownCard({ active, mrrTotal }: { active: ClientPublic[]; mrrTotal: number }) {
  const [dimension, setDimension] = useState<Dimension>("stage");
  const { labels: stageLabels } = useRosterOptions("stage");
  const { labels: healthLabels } = useRosterOptions("health");
  const { platformLabels } = useAdPlatformOptions();

  const rows = useMemo<RankedRow[]>(() => {
    const groups = new Map<string, { name: string; count: number; mrr: number }>();
    const add = (key: string, name: string, mrr: number) => {
      const g = groups.get(key) ?? { name, count: 0, mrr: 0 };
      g.count += 1;
      g.mrr += mrr;
      groups.set(key, g);
    };
    for (const c of active) {
      const mrr = effectiveMrrCents(c);
      const values: Array<{ key: string; name: string }> =
        dimension === "stage"
          ? c.profile.stages.map((v) => ({ key: v, name: stageLabels[v] ?? v }))
          : dimension === "health"
            ? c.profile.health.map((v) => ({ key: v, name: healthLabels[v] ?? v }))
            : dimension === "service"
              ? c.profile.services.map((v) => ({ key: v, name: SERVICE_LABELS[v] ?? v }))
              : dimension === "platform"
                ? c.profile.adPlatforms.map((v) => ({ key: v, name: platformLabels[v] ?? v }))
                : c.team.filter((m) => m.role === "media_buyer").map((m) => ({ key: m.adminId, name: m.name }));
      if (values.length === 0) add("__none__", "Not set", mrr);
      else for (const v of values) add(v.key, v.name, mrr);
    }
    const sorted = [...groups.entries()]
      .map(([key, g]) => ({ key, ...g }))
      .sort((a, b) => Number(a.key === "__none__") - Number(b.key === "__none__") || b.mrr - a.mrr || b.count - a.count);
    const top = sorted.slice(0, SHOWN_GROUPS);
    const max = Math.max(...top.map((g) => g.mrr), 1);
    return top.map((g) => ({
      key: g.key,
      name: g.name,
      value: formatMoney(g.mrr),
      detail: `${g.count} client${g.count === 1 ? "" : "s"} · ${pctOf(g.mrr, mrrTotal)}%`,
      pct: (g.mrr / max) * 100,
      muted: g.key === "__none__",
    }));
  }, [active, dimension, stageLabels, healthLabels, platformLabels, mrrTotal]);

  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-muted-foreground" />
            <CardTitle>Where MRR Sits</CardTitle>
          </div>
          <CardDescription className="text-xs">Active clients</CardDescription>
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={dimension}
          onValueChange={(v) => {
            if (v) setDimension(v as Dimension);
          }}
          aria-label="Group MRR by"
          className="max-w-full justify-start overflow-x-auto"
        >
          {DIMENSIONS.map((d) => (
            <ToggleGroupItem key={d.value} value={d.value} className="px-3">
              {d.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardHeader>
      <CardContent className="flex-1">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No active clients.</p>
        ) : (
          <>
            <RankedBars rows={rows} barClass="bg-chart-1" />
            <p className="mt-4 text-xs text-muted-foreground">
              A client can sit in more than one group, so shares can add up to more than 100%.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Biggest clients — MRR concentration
// ---------------------------------------------------------------------------

const TOP_CLIENTS = 6;

function TopClientsCard({ active, mrrTotal }: { active: ClientPublic[]; mrrTotal: number }) {
  const { rows, top5Pct } = useMemo(() => {
    const ranked = active
      .map((c) => ({ c, mrr: effectiveMrrCents(c) }))
      .filter((r) => r.mrr > 0)
      .sort((a, b) => b.mrr - a.mrr);
    const max = ranked[0]?.mrr ?? 1;
    return {
      top5Pct: pctOf(
        ranked.slice(0, 5).reduce((s, r) => s + r.mrr, 0),
        mrrTotal
      ),
      rows: ranked.slice(0, TOP_CLIENTS).map<RankedRow>(({ c, mrr }) => ({
        key: c.id,
        name: c.displayName,
        value: formatMoney(mrr),
        detail: `${pctOf(mrr, mrrTotal)}%`,
        pct: (mrr / max) * 100,
        href: `/dashboard/users/${c.id}`,
      })),
    };
  }, [active, mrrTotal]);

  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <Crown className="size-4 text-muted-foreground" />
          <CardTitle>Biggest Clients</CardTitle>
        </div>
        <CardDescription className="text-xs">Share of MRR</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No active clients with MRR.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-2xl font-semibold tracking-tight tabular-nums">{top5Pct}%</span>
              <span className="text-xs text-muted-foreground">of MRR comes from the top 5 clients</span>
            </div>
            <RankedBars rows={rows} barClass="bg-chart-2" />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// New clients per month (by join date)
// ---------------------------------------------------------------------------

const joinConfig = {
  joined: { label: "New clients", color: "hsl(var(--chart-1))" },
} satisfies ChartConfig;

function NewClientsChart({
  clients,
  months,
  className,
}: {
  clients: ClientPublic[];
  months: string[];
  className?: string;
}) {
  const { data, total } = useMemo(() => {
    const joined = joinedByMonth(clients.map((c) => c.knownJoinedAt ?? null), months);
    return {
      total: joined.reduce((s, n) => s + n, 0),
      data: months.map((ym, i) => ({
        key: ym,
        label: format(monthDate(ym), "MMM"),
        title: format(monthDate(ym), "MMMM yyyy"),
        joined: joined[i],
      })),
    };
  }, [clients, months]);
  type Datum = (typeof data)[number];
  const last = data.length - 1;

  return (
    <Card className={cn("flex min-w-0 flex-col", className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <UserPlus className="size-4 text-muted-foreground" />
          <CardTitle>New Clients</CardTitle>
        </div>
        <CardDescription className="text-xs">By join date</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-2xl font-semibold tracking-tight tabular-nums">{total}</span>
          <span className="text-xs text-muted-foreground">joined in the last 12 months</span>
        </div>
        <ChartContainer config={joinConfig} className="aspect-auto h-[200px] w-full">
          <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => (payload?.[0]?.payload as Datum | undefined)?.title ?? null}
                />
              }
            />
            <Bar dataKey="joined" fill="var(--color-joined)" radius={[6, 6, 0, 0]} maxBarSize={28} animationDuration={600}>
              {data.map((d, i) => (
                <Cell key={d.key} fillOpacity={i === last ? 1 : 0.7} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
