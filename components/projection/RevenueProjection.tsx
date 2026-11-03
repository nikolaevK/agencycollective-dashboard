"use client";

import { useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import {
  CalendarRange,
  Coins,
  Database,
  DollarSign,
  Gauge,
  Info,
  Lightbulb,
  Percent,
  PiggyBank,
  Sigma,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import { StatCard } from "@/components/overview/StatCard";
import { TrendDelta } from "@/components/shared/TrendDelta";
import { BadgeDot, StatusBadge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useProjectionBaseline } from "@/hooks/useProjectionBaseline";
import { fmtMoney as fmt, fullMoney as full } from "./format";
import type { BookDatum, RevenueDatum, ScenarioDatum } from "./ProjectionCharts";

// recharts loads after the page — the levers, KPIs and table don't wait on it.
const RevenueMixChart = dynamic(() => import("./ProjectionCharts").then((m) => m.RevenueMixChart), {
  ssr: false,
  loading: () => <Skeleton className="h-[300px] w-full" />,
});
const BookChart = dynamic(() => import("./ProjectionCharts").then((m) => m.BookChart), {
  ssr: false,
  loading: () => <Skeleton className="h-[280px] w-full" />,
});
const ScenarioChart = dynamic(() => import("./ProjectionCharts").then((m) => m.ScenarioChart), {
  ssr: false,
  loading: () => <Skeleton className="h-[280px] w-full" />,
});

// ── Defaults (illustrative planning seeds; the book + retainer can be pulled
//    live from the Client Directory below) ─────────────────────────────────
const DEFAULTS = {
  start: 48,
  ret: 65, // %
  newm: 14,
  ramp: 0, // pts/month
  retainer: 8700,
  newbill: 6500,
  fee: 7500,
  expenses: 150000, // fixed monthly operating expenses
};
const START_MAX = 100;
const RETAINER_MAX = 20000;
const EXPENSES_MAX = 1_000_000;

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface MonthMeta {
  label: string;
  year: number;
}

/** `count` consecutive months starting at (year, month0); month0 is 0-based. */
function buildMonths(year: number, month0: number, count: number): MonthMeta[] {
  const out: MonthMeta[] = [];
  for (let i = 0; i < count; i++) {
    const m = (month0 + i) % 12;
    const y = year + Math.floor((month0 + i) / 12);
    out.push({ label: MONTH_ABBR[m], year: y });
  }
  return out;
}

interface MonthRow {
  label: string;
  year: number;
  startA: number;
  retained: number;
  newWon: number;
  end: number;
  index: number;
  retRev: number;
  newRev: number;
  perfRev: number;
  totRev: number;
}

function project(
  start: number,
  r0: number,
  N: number,
  months: MonthMeta[],
  rampPts: number,
  retainer: number,
  newbill: number,
  perf: number
): MonthRow[] {
  const rows: MonthRow[] = [];
  let a = start;
  for (let i = 0; i < months.length; i++) {
    const r = Math.min(0.92, r0 + (rampPts / 100) * i);
    const s = a;
    const ret = Math.round(s * r);
    const en = ret + N;
    const retRev = ret * retainer;
    const newRev = N * newbill;
    const perfRev = ret * perf;
    rows.push({
      label: months[i].label,
      year: months[i].year,
      startA: s,
      retained: ret,
      newWon: N,
      end: en,
      index: start > 0 ? Math.round((en / start) * 100) : 0,
      retRev,
      newRev,
      perfRev,
      totRev: retRev + newRev + perfRev,
    });
    a = en;
  }
  return rows;
}

// ── Small presentational pieces ──────────────────────────────────────────────

/** A lever group inside the settings card. */
function LeverGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border p-4">
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

/** A native range slider with its label + live value. */
function Slider({
  label,
  ariaLabel,
  display,
  value,
  min,
  max,
  step,
  onChange,
  children,
}: {
  label: string;
  ariaLabel: string;
  display: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-medium tabular-nums text-foreground">{display}</span>
      </div>
      <input
        type="range"
        aria-label={ariaLabel}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="w-full cursor-pointer [accent-color:hsl(var(--primary))]"
      />
      {children}
    </div>
  );
}

/** Preset buttons in a segmented track. Plain pressed buttons (each its own
 *  Tab stop, as before) — no ToggleGroup runtime on this page. */
function Presets<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 rounded-3xl bg-muted p-1">
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          // Wraps on a narrow phone ("Baseline 65%") instead of truncating.
          className="min-h-9 min-w-0 flex-1 rounded-full px-2 py-1 text-xs font-medium leading-tight text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30 aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm sm:min-h-7"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A "pull the live Client Directory value" button under a slider. */
function LiveButton({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button type="button" variant="outline" size="xs" disabled={disabled} onClick={onClick}>
      <Database />
      {children}
    </Button>
  );
}

/** Compact result tile beside the revenue chart. */
function Out({ label, value, sub, delta }: { label: string; value: string; sub: string; delta?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl bg-muted/50 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="whitespace-nowrap text-xl font-semibold tracking-tight tabular-nums">{value}</span>
        {delta}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

// Phones: the decorative KPI icon gives its room to the label.
const KPI_ICON = "max-sm:hidden";
// …and a long label ("End monthly revenue") wraps instead of truncating in
// the two-column phone grid (StatCard truncates its label <p>).
const KPI_WRAP = "[&_p.truncate]:whitespace-normal";

const BOOK_DELTA_TITLE = "End book vs the starting book";

/** A red "Loss" chip on a profit card that went negative. */
const lossChip = (v: number) => (v < 0 ? <StatusBadge tone="danger">Loss</StatusBadge> : undefined);

export function RevenueProjection() {
  const [start, setStart] = useState(DEFAULTS.start);
  const [ret, setRet] = useState(DEFAULTS.ret);
  const [newm, setNewm] = useState(DEFAULTS.newm);
  const [ramp, setRamp] = useState(DEFAULTS.ramp);
  const [retainer, setRetainer] = useState(DEFAULTS.retainer);
  const [newbill, setNewbill] = useState(DEFAULTS.newbill);
  const [fee, setFee] = useState(DEFAULTS.fee);
  const [expenses, setExpenses] = useState(DEFAULTS.expenses);

  // Anchor the projection to the current calendar month. "Rest of year" runs
  // from this month through December; "Full 12 months" rolls a year forward.
  const [now] = useState(() => new Date());
  const curMonth = now.getMonth();
  const curYear = now.getFullYear();
  const restOfYearCount = 12 - curMonth;
  const [horizon, setHorizon] = useState(restOfYearCount);

  const months = useMemo(
    () => buildMonths(curYear, curMonth, horizon),
    [curYear, curMonth, horizon]
  );

  const { data: baseline, isFetching } = useProjectionBaseline();

  // Live values can exceed the default slider ceilings — widen as needed.
  const startMax = Math.max(START_MAX, baseline?.activeClientCount ?? 0, start);
  const retainerMax = Math.max(RETAINER_MAX, baseline?.averageMrr ?? 0, retainer);

  const rows = useMemo(
    () => project(start, ret / 100, newm, months, ramp, retainer, newbill, fee),
    [start, ret, newm, months, ramp, retainer, newbill, fee]
  );

  const last = rows[rows.length - 1];
  const endBook = last?.end ?? 0;
  const endIdx = last?.index ?? 0;
  const endRev = last?.totRev ?? 0;
  const cumRev = rows.reduce((a, b) => a + b.totRev, 0);
  const runRate = endRev * 12;

  // Expenses are a flat monthly overhead — they don't scale with the book.
  const endProfit = endRev - expenses;
  const cumProfit = cumRev - expenses * horizon;
  const endMargin = endRev > 0 ? (endProfit / endRev) * 100 : 0;

  const revData: RevenueDatum[] = rows.map((r) => ({
    label: r.label,
    title: `${r.label} ${r.year}`,
    retainer: r.retRev,
    newAccounts: r.newRev,
    perf: r.perfRev,
    profit: r.totRev - expenses,
  }));
  const bookData: BookDatum[] = rows.map((r) => ({ label: r.label, title: `${r.label} ${r.year}`, book: r.end }));

  const scen = useMemo<ScenarioDatum[]>(() => {
    const s7 = project(start, 0.07, newm, months, 0, retainer, newbill, fee);
    const s65 = project(start, 0.65, newm, months, 0, retainer, newbill, fee);
    const s80 = project(start, 0.8, newm, months, 0, retainer, newbill, fee);
    return rows.map((r, i) => ({
      label: r.label,
      title: `${r.label} ${r.year}`,
      s80: s80[i].totRev,
      s65: s65[i].totRev,
      s7: s7[i].totRev,
    }));
  }, [start, newm, months, retainer, newbill, fee, rows]);

  const endLabel = last ? `${last.label} ${last.year}` : "";

  let takeaway: string;
  if (endIdx >= 110)
    takeaway = `At ${ret}% retention with ${newm} new accounts/month, the book grows to index ${endIdx} and monthly revenue reaches ${fmt(endRev)} (${fmt(runRate)} annualized). Retention is compounding the book.`;
  else if (endIdx >= 95)
    takeaway = `At ${ret}% retention with ${newm} new/month, the book holds steady (index ${endIdx}) and monthly revenue lands near ${fmt(endRev)}. To grow revenue, raise retention or win more accounts — retention is the cheaper lever.`;
  else
    takeaway = `At ${ret}% retention with ${newm} new/month, the book shrinks to index ${endIdx} and revenue erodes to ${fmt(endRev)}/mo — a treadmill re-winning what it loses. Lifting retention is the priority.`;

  const retPresets = [
    { value: 7, label: "Today ~7%" },
    { value: 65, label: "Baseline 65%" },
    { value: 80, label: "Stretch 80%" },
  ];
  const feePresets = [0, 5000, 7500, 10000].map((f) => ({ value: f, label: f === 0 ? "Off" : "$" + f / 1000 + "K" }));
  const horizonPresets = [
    { value: restOfYearCount, label: `Rest of ${curYear}` },
    { value: 12, label: "Full 12 months" },
  ];
  const liveLabel = (live: string) => (baseline ? live : isFetching ? "Loading live…" : "Live data unavailable");

  return (
    <div className="space-y-6">
      {/* How revenue is built */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2 md:pb-2">
          <Info className="size-4 shrink-0 text-muted-foreground" />
          <CardTitle>How revenue is built</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Each month: <b className="font-medium text-foreground">Retainer revenue</b> = retained clients × avg
            retainer · <b className="font-medium text-foreground">New-account billings</b> = new accounts won × avg
            first billing · <b className="font-medium text-foreground">Performance fees</b> = rebilling clients ×
            per-client fee. All three averages are editable so you can match real numbers. The{" "}
            <b className="font-medium text-foreground">Book Index</b> (start = 100) tracks book momentum separately
            from dollars.
          </p>
        </CardContent>
      </Card>

      {/* KPIs — book / revenue / profit, one row each from sm up */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard className={KPI_WRAP} iconClassName={KPI_ICON} label="Start book" icon={Users} value={`${start}`} sub="baseline" />
        <StatCard
          className={KPI_WRAP}
          iconClassName={KPI_ICON}
          label="End book"
          icon={UserPlus}
          value={`${endBook}`}
          delta={<TrendDelta current={endBook} previous={start} title={BOOK_DELTA_TITLE} />}
          sub={`by ${endLabel}`}
        />
        <StatCard className={KPI_WRAP} iconClassName={KPI_ICON} label="Book Index" icon={Gauge} value={`${endIdx}`} sub="start = 100" />
        <StatCard className={KPI_WRAP} iconClassName={KPI_ICON} label="End monthly revenue" icon={DollarSign} value={fmt(endRev)} sub="final month" />
        <StatCard className={KPI_WRAP} iconClassName={KPI_ICON} label="Cumulative revenue" icon={Sigma} value={fmt(cumRev)} sub={`${horizon} months`} />
        <StatCard className={KPI_WRAP} iconClassName={KPI_ICON} label="Annualized run-rate" icon={TrendingUp} value={fmt(runRate)} sub="end month × 12" />
        <StatCard
          className={KPI_WRAP}
          iconClassName={KPI_ICON}
          label="End monthly profit"
          icon={PiggyBank}
          value={fmt(endProfit)}
          delta={lossChip(endProfit)}
          sub="revenue − expenses"
        />
        <StatCard
          className={KPI_WRAP}
          iconClassName={KPI_ICON}
          label="Cumulative profit"
          icon={Coins}
          value={fmt(cumProfit)}
          delta={lossChip(cumProfit)}
          sub={`${horizon} months`}
        />
        <StatCard
          className={KPI_WRAP}
          iconClassName={KPI_ICON}
          label="End net margin"
          icon={Percent}
          value={`${Math.round(endMargin)}%`}
          delta={lossChip(endMargin)}
          sub="final month"
        />
      </div>

      {/* Projection settings — overflow-visible so the results column can stick */}
      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle>Projection settings</CardTitle>
          <CardDescription>
            Adjust the levers and the revenue averages to project the rest of the year. Pull the active-book and
            retainer baselines straight from the Client Directory.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
            {/* Controls */}
            <div className="min-w-0 space-y-4">
              <LeverGroup title="Growth levers">
                <Slider
                  label="Starting active book"
                  ariaLabel="Starting active book (clients)"
                  display={`${start}`}
                  value={start}
                  min={0}
                  max={startMax}
                  step={1}
                  onChange={setStart}
                >
                  <LiveButton disabled={!baseline} onClick={() => baseline && setStart(baseline.activeClientCount)}>
                    {liveLabel(`Use live (${baseline?.activeClientCount} active)`)}
                  </LiveButton>
                </Slider>

                <Slider
                  label="Monthly retention"
                  ariaLabel="Monthly retention percentage"
                  display={`${ret}%`}
                  value={ret}
                  min={0}
                  max={95}
                  step={1}
                  onChange={setRet}
                >
                  <Presets label="Retention presets" options={retPresets} value={ret} onChange={setRet} />
                </Slider>

                <Slider
                  label="New accounts won / month"
                  ariaLabel="New accounts won per month"
                  display={`${newm}`}
                  value={newm}
                  min={0}
                  max={40}
                  step={1}
                  onChange={setNewm}
                />

                <Slider
                  label="Retention improves / month"
                  ariaLabel="Retention improvement points per month"
                  display={`${ramp} pts`}
                  value={ramp}
                  min={0}
                  max={5}
                  step={0.5}
                  onChange={setRamp}
                />
              </LeverGroup>

              <LeverGroup title="Horizon">
                <Presets label="Horizon" options={horizonPresets} value={horizon} onChange={setHorizon} />
              </LeverGroup>

              <LeverGroup title="Revenue averages (real numbers)">
                <Slider
                  label="Avg retainer / active client"
                  ariaLabel="Average retainer per active client (dollars)"
                  display={full(retainer)}
                  value={retainer}
                  min={0}
                  max={retainerMax}
                  step={100}
                  onChange={setRetainer}
                >
                  <LiveButton disabled={!baseline} onClick={() => baseline && setRetainer(baseline.averageMrr)}>
                    {liveLabel(`Use live avg MRR (${full(baseline?.averageMrr ?? 0)})`)}
                  </LiveButton>
                </Slider>

                <Slider
                  label="Avg new-account first billing"
                  ariaLabel="Average new-account first billing (dollars)"
                  display={full(newbill)}
                  value={newbill}
                  min={0}
                  max={15000}
                  step={100}
                  onChange={setNewbill}
                />

                <Slider
                  label="Performance fee / rebilling client"
                  ariaLabel="Performance fee per rebilling client (dollars)"
                  display={fee === 0 ? "Off" : full(fee)}
                  value={fee}
                  min={0}
                  max={15000}
                  step={250}
                  onChange={setFee}
                >
                  <Presets label="Performance fee presets" options={feePresets} value={fee} onChange={setFee} />
                </Slider>
              </LeverGroup>

              <LeverGroup title="Costs">
                <Slider
                  label="Monthly operating expenses"
                  ariaLabel="Fixed monthly operating expenses (dollars)"
                  display={full(expenses)}
                  value={expenses}
                  min={0}
                  max={EXPENSES_MAX}
                  step={5000}
                  onChange={setExpenses}
                >
                  <p className="text-xs text-muted-foreground">Flat overhead per month — does not scale with the book.</p>
                </Slider>
              </LeverGroup>
            </div>

            {/* Output + revenue chart — stays in view while the levers scroll */}
            <div className="min-w-0 space-y-4 lg:sticky lg:top-6 lg:self-start">
              {/* One column beside the levers at lg (the column is ~300px at
                  1024–1279), three again from xl. */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                <Out
                  label="End active book"
                  value={`${endBook}`}
                  sub="clients"
                  delta={<TrendDelta current={endBook} previous={start} title={BOOK_DELTA_TITLE} />}
                />
                <Out label="End monthly revenue" value={fmt(endRev)} sub="final month" />
                <Out label="Cumulative revenue" value={fmt(cumRev)} sub={`over ${horizon} mo`} />
              </div>
              <RevenueMixChart data={revData} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Book + scenarios */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Active client book</CardTitle>
            <CardDescription>Retained + newly won, month by month</CardDescription>
          </CardHeader>
          <CardContent>
            <BookChart data={bookData} />
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Revenue scenarios by retention</CardTitle>
            <CardDescription>
              Monthly revenue at 7% / 65% / 80% retention (same averages &amp; new-accounts pace)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScenarioChart data={scen} />
          </CardContent>
        </Card>
      </div>

      {/* Month-by-month table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarRange className="size-4 shrink-0 text-muted-foreground" />
            <CardTitle>Month-by-month projection</CardTitle>
          </div>
          <CardDescription>
            Active book = retained + new · Revenue = retainer + new-account billings + performance fees
          </CardDescription>
        </CardHeader>
        <Table className="min-w-[760px] tabular-nums">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4 md:pl-6">Month</TableHead>
              <TableHead className="text-right">Start</TableHead>
              <TableHead className="text-right">Retained</TableHead>
              <TableHead className="text-right">New</TableHead>
              <TableHead className="text-right">End book</TableHead>
              <TableHead className="text-right">Index</TableHead>
              <TableHead className="text-right">Retainer $</TableHead>
              <TableHead className="text-right">New $</TableHead>
              <TableHead className="text-right">Perf $</TableHead>
              <TableHead className="pr-4 text-right md:pr-6">Total rev</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => {
              const idxTone: BadgeTone = r.index >= 100 ? "success" : r.index >= 90 ? "neutral" : "danger";
              return (
                <TableRow key={i}>
                  <TableCell className="pl-4 md:pl-6">
                    {r.label} &apos;{String(r.year).slice(2)}
                  </TableCell>
                  <TableCell className="text-right">{r.startA}</TableCell>
                  <TableCell className="text-right">{r.retained}</TableCell>
                  <TableCell className="text-right text-muted-foreground">+{r.newWon}</TableCell>
                  <TableCell className="text-right font-semibold">{r.end}</TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex items-center justify-end gap-1.5">
                      <BadgeDot tone={idxTone} />
                      {r.index}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{fmt(r.retRev)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{fmt(r.newRev)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{fmt(r.perfRev)}</TableCell>
                  <TableCell className="pr-4 text-right font-semibold md:pr-6">{fmt(r.totRev)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <TableCell className="pl-4 font-semibold md:pl-6">Total</TableCell>
              <TableCell colSpan={5} />
              <TableCell className="text-right font-semibold">{fmt(rows.reduce((a, b) => a + b.retRev, 0))}</TableCell>
              <TableCell className="text-right font-semibold">{fmt(rows.reduce((a, b) => a + b.newRev, 0))}</TableCell>
              <TableCell className="text-right font-semibold">{fmt(rows.reduce((a, b) => a + b.perfRev, 0))}</TableCell>
              <TableCell className="pr-4 text-right font-semibold md:pr-6">{fmt(cumRev)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Card>

      {/* Takeaway */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2 md:pb-2">
          <Lightbulb className="size-4 shrink-0 text-muted-foreground" />
          <CardTitle>The takeaway</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {takeaway} Cumulative {horizon}-month revenue:{" "}
            <b className="font-semibold text-foreground">{fmt(cumRev)}</b>.
          </p>
        </CardContent>
      </Card>

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <TrendingUp className="mt-px size-3.5 shrink-0" />
        <span>
          Projections are illustrative planning figures, not guarantees. Baselines pull from the Client Directory&apos;s
          active clients{baseline ? ` (${baseline.activeClientCount} active, ${full(baseline.averageMrr)} avg MRR)` : ""}
          {isFetching ? " · refreshing…" : ""}.
        </span>
      </p>
    </div>
  );
}
