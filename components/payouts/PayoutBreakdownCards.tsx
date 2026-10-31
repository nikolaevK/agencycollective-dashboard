"use client";

import { PieChart, Users } from "lucide-react";
import { formatCents } from "@/components/closers/types";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PayoutBreakdownItem } from "@/lib/payouts";

const TOP_BRANDS = 6;
/** One client above this share of the month is flagged as concentrated. */
const CONCENTRATED_PCT = 25;

const pctOf = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
const sumDue = (items: PayoutBreakdownItem[]) => items.reduce((s, i) => s + i.amountDue, 0);

interface RankedRow {
  name: string;
  value: string;
  detail: string;
  /** Bar length, 0–100. */
  pct: number;
  muted?: boolean;
}

/** `barClass`: the bar color — neutral for mixed revenue, chart-1 for new business. */
function RankedBars({ rows, barClass }: { rows: RankedRow[]; barClass: string }) {
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.name} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className={cn("truncate", r.muted ? "text-muted-foreground" : "font-medium")}>
              {r.name}
            </span>
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
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground truncate">{label}</p>
      <p className="truncate text-lg font-semibold tracking-tight tabular-nums" title={value}>
        {value}
      </p>
    </div>
  );
}

/** How much of the month rests on its biggest clients (bars = share of the
 *  month's total due). */
export function PayoutConcentrationCard({
  brands,
  monthLabel,
}: {
  brands: PayoutBreakdownItem[];
  monthLabel: string;
}) {
  const total = sumDue(brands);
  const topShare = brands[0] ? pctOf(brands[0].amountDue, total) : 0;
  const rest = brands.slice(TOP_BRANDS);
  const rows: RankedRow[] = brands.slice(0, TOP_BRANDS).map((b) => {
    const pct = pctOf(b.amountDue, total);
    return { name: b.name, value: formatCents(b.amountDue), detail: `${pct}%`, pct };
  });
  if (rest.length > 0) {
    const pct = pctOf(sumDue(rest), total);
    rows.push({
      name: `${rest.length} other client${rest.length === 1 ? "" : "s"}`,
      value: formatCents(sumDue(rest)),
      detail: `${pct}%`,
      pct,
      muted: true,
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-1 space-y-0 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <div className="flex items-center gap-2">
          <PieChart className="size-4 text-muted-foreground" />
          <CardTitle>Client Concentration</CardTitle>
          {topShare >= CONCENTRATED_PCT && <StatusBadge tone="warning">Concentrated</StatusBadge>}
        </div>
        <CardDescription className="text-xs">{monthLabel}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No payouts this month.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Top client" value={`${topShare}%`} />
              <Stat label="Top 3" value={`${pctOf(sumDue(brands.slice(0, 3)), total)}%`} />
              <Stat label="Clients" value={String(brands.length)} />
            </div>
            <RankedBars rows={rows} barClass="bg-foreground/60" />
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** New business per sales rep (bars relative to the top rep). */
export function PayoutSalesRepCard({
  reps,
  monthLabel,
}: {
  reps: PayoutBreakdownItem[];
  monthLabel: string;
}) {
  const total = sumDue(reps);
  const max = reps[0]?.amountDue ?? 0;
  const rows: RankedRow[] = reps.map((r) => ({
    name: r.name,
    value: formatCents(r.amountDue),
    detail: `${r.count} payout${r.count === 1 ? "" : "s"} · ${pctOf(r.amountDue, total)}%`,
    pct: pctOf(r.amountDue, max),
    muted: r.name === "Unassigned",
  }));

  return (
    <Card>
      <CardHeader className="flex flex-col gap-1 space-y-0 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <CardTitle>Sales Reps</CardTitle>
        </div>
        <CardDescription className="text-xs">New business · {monthLabel}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No new business this month.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="New business" value={formatCents(total)} />
              <Stat label="Payouts" value={String(reps.reduce((s, r) => s + r.count, 0))} />
              <Stat label="Reps" value={String(reps.filter((r) => r.name !== "Unassigned").length)} />
            </div>
            <RankedBars rows={rows} barClass="bg-chart-1" />
          </>
        )}
        <p className="text-xs text-muted-foreground">Rows of rebilling brands and Ad Account payments aren&apos;t new business.</p>
      </CardContent>
    </Card>
  );
}
