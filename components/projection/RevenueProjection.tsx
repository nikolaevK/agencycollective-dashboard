"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Database, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjectionBaseline } from "@/hooks/useProjectionBaseline";

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

// Data-series colors (fixed across themes — these encode meaning, not chrome).
const SERIES = {
  retainer: "hsl(263 70% 60%)", // violet (brand primary)
  newAcct: "#3b82f6", // blue
  perf: "#f59e0b", // amber
  good: "#10b981", // green
  bad: "#ef4444", // red
};

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

const fmt = (v: number) => {
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= 1e6) return sign + "$" + (a / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return sign + "$" + (a / 1e3).toFixed(0) + "K";
  return sign + "$" + Math.round(a).toLocaleString();
};
const full = (v: number) => (v < 0 ? "-$" : "$") + Math.round(Math.abs(v)).toLocaleString();

/** Reads structural chart colors from the active theme's CSS variables. */
function useChartColors() {
  const [c, setC] = useState({
    grid: "hsl(240 6% 88%)",
    axis: "hsl(240 6% 46%)",
    tooltipBg: "hsl(0 0% 100%)",
    tooltipText: "hsl(240 15% 9%)",
  });
  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement);
      const v = (n: string, fb: string) => {
        const raw = cs.getPropertyValue(n).trim();
        return raw ? `hsl(${raw})` : fb;
      };
      setC({
        grid: v("--border", "hsl(240 6% 88%)"),
        axis: v("--muted-foreground", "hsl(240 6% 46%)"),
        tooltipBg: v("--popover", "hsl(0 0% 100%)"),
        tooltipText: v("--popover-foreground", "hsl(240 15% 9%)"),
      });
    };
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return c;
}

// ── Small presentational pieces ──────────────────────────────────────────────
function Kpi({
  label,
  value,
  note,
  accent,
}: {
  label: string;
  value: string;
  note: string;
  accent: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border bg-card p-4">
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: accent }} />
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1.5 text-2xl font-extrabold tracking-tight text-foreground">{value}</div>
      <div className="mt-0.5 text-[11.5px] text-muted-foreground/70">{note}</div>
    </div>
  );
}

function Out({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="rounded-xl border bg-muted/40 p-3.5">
      <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-extrabold tracking-tight" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      <div className="mt-0.5 text-[11.5px] text-muted-foreground/70">{sub}</div>
    </div>
  );
}

const sliderCls =
  "w-full cursor-pointer accent-primary [accent-color:hsl(var(--primary))]";

function ChartTooltip({
  active,
  payload,
  label,
  colors,
  unit,
}: {
  active?: boolean;
  payload?: readonly { name?: string | number; value?: number | string; color?: string }[];
  label?: string | number;
  colors: { tooltipBg: string; tooltipText: string; grid: string };
  unit: "money" | "clients";
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-lg"
      style={{ background: colors.tooltipBg, color: colors.tooltipText, borderColor: colors.grid }}
    >
      <div className="mb-1 font-semibold">{label}</div>
      {payload.map((p) => (
        <div key={String(p.name)} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="ml-auto font-medium tabular-nums">
            {unit === "money" ? full(Number(p.value ?? 0)) : `${p.value ?? 0}`}
          </span>
        </div>
      ))}
    </div>
  );
}

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

  const colors = useChartColors();
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

  const revData = rows.map((r) => ({
    label: r.label,
    Retainer: r.retRev,
    "New accounts": r.newRev,
    "Performance fees": r.perfRev,
    "Net profit": r.totRev - expenses,
  }));
  const bookData = rows.map((r) => ({ label: r.label, "Active book": r.end }));

  const scen = useMemo(() => {
    const s7 = project(start, 0.07, newm, months, 0, retainer, newbill, fee);
    const s65 = project(start, 0.65, newm, months, 0, retainer, newbill, fee);
    const s80 = project(start, 0.8, newm, months, 0, retainer, newbill, fee);
    return rows.map((r, i) => ({
      label: r.label,
      "80% retention": s80[i].totRev,
      "65% baseline": s65[i].totRev,
      "~7% (today)": s7[i].totRev,
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
    { v: 7, label: "Today ~7%" },
    { v: 65, label: "Baseline 65%", base: true },
    { v: 80, label: "Stretch 80%" },
  ];
  const feePresets = [0, 5000, 7500, 10000];

  return (
    <div className="space-y-5">
      {/* How revenue is built */}
      <div className="rounded-xl border-l-4 border-l-emerald-500 bg-emerald-500/5 p-4">
        <h4 className="text-sm font-semibold text-foreground">How revenue is built</h4>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          Each month: <b>Retainer revenue</b> = retained clients × avg retainer · <b>New-account billings</b> ={" "}
          new accounts won × avg first billing · <b>Performance fees</b> = rebilling clients × per-client fee. All
          three averages are editable so you can match real numbers. The <b>Book Index</b> (start = 100) tracks book
          momentum separately from dollars.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Start book" value={`${start}`} note="baseline" accent={SERIES.retainer} />
        <Kpi
          label="End book"
          value={`${endBook}`}
          note={`by ${endLabel}`}
          accent={endBook >= start ? SERIES.good : SERIES.perf}
        />
        <Kpi label="Book Index" value={`${endIdx}`} note="start = 100" accent={SERIES.newAcct} />
        <Kpi label="End monthly revenue" value={fmt(endRev)} note="final month" accent={SERIES.good} />
        <Kpi label="Cumulative revenue" value={fmt(cumRev)} note={`${horizon} months`} accent={SERIES.retainer} />
        <Kpi label="Annualized run-rate" value={fmt(runRate)} note="end month × 12" accent={SERIES.perf} />
        <Kpi
          label="End monthly profit"
          value={fmt(endProfit)}
          note="revenue − expenses"
          accent={endProfit >= 0 ? SERIES.good : SERIES.bad}
        />
        <Kpi
          label="Cumulative profit"
          value={fmt(cumProfit)}
          note={`${horizon} months`}
          accent={cumProfit >= 0 ? SERIES.good : SERIES.bad}
        />
        <Kpi
          label="End net margin"
          value={`${Math.round(endMargin)}%`}
          note="final month"
          accent={endMargin >= 0 ? SERIES.newAcct : SERIES.bad}
        />
      </div>

      {/* Projection settings */}
      <div className="rounded-xl border bg-card p-5 md:p-6">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-foreground">Projection settings</h3>
          <p className="text-[12.5px] text-muted-foreground/80">
            Adjust the levers and the revenue averages to project the rest of the year. Pull the active-book and
            retainer baselines straight from the Client Directory.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[340px_1fr]">
          {/* Controls */}
          <div className="space-y-4">
            {/* Growth levers */}
            <div className="rounded-lg border p-3.5">
              <div className="mb-3 text-[10.5px] font-bold uppercase tracking-wider text-primary">Growth levers</div>

              <div className="mb-3.5">
                <label className="mb-1.5 flex items-center justify-between text-[12.5px] font-semibold">
                  <span>Starting active book</span>
                  <span className="tabular-nums text-primary">{start}</span>
                </label>
                <input
                  type="range"
                  aria-label="Starting active book (clients)"
                  min={0}
                  max={startMax}
                  step={1}
                  value={start}
                  onChange={(e) => setStart(+e.target.value)}
                  className={sliderCls}
                />
                <button
                  type="button"
                  disabled={!baseline}
                  onClick={() => baseline && setStart(baseline.activeClientCount)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Database className="h-3 w-3" />
                  {baseline
                    ? `Use live (${baseline.activeClientCount} active)`
                    : isFetching
                      ? "Loading live…"
                      : "Live data unavailable"}
                </button>
              </div>

              <div className="mb-3.5">
                <label className="mb-1.5 flex items-center justify-between text-[12.5px] font-semibold">
                  <span>Monthly retention</span>
                  <span className="tabular-nums text-primary">{ret}%</span>
                </label>
                <input
                  type="range"
                  aria-label="Monthly retention percentage"
                  min={0}
                  max={95}
                  step={1}
                  value={ret}
                  onChange={(e) => setRet(+e.target.value)}
                  className={sliderCls}
                />
                <div className="mt-2 flex gap-1.5">
                  {retPresets.map((p) => (
                    <button
                      key={p.v}
                      type="button"
                      onClick={() => setRet(p.v)}
                      className={cn(
                        "flex-1 rounded-md border px-2 py-1.5 text-[11px] font-bold transition-colors",
                        ret === p.v
                          ? "border-primary bg-primary text-primary-foreground"
                          : p.base
                            ? "border-emerald-500/50 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
                            : "border-border text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-3.5">
                <label className="mb-1.5 flex items-center justify-between text-[12.5px] font-semibold">
                  <span>New accounts won / month</span>
                  <span className="tabular-nums text-primary">{newm}</span>
                </label>
                <input
                  type="range"
                  aria-label="New accounts won per month"
                  min={0}
                  max={40}
                  step={1}
                  value={newm}
                  onChange={(e) => setNewm(+e.target.value)}
                  className={sliderCls}
                />
              </div>

              <div>
                <label className="mb-1.5 flex items-center justify-between text-[12.5px] font-semibold">
                  <span>Retention improves / month</span>
                  <span className="tabular-nums text-primary">{ramp} pts</span>
                </label>
                <input
                  type="range"
                  aria-label="Retention improvement points per month"
                  min={0}
                  max={5}
                  step={0.5}
                  value={ramp}
                  onChange={(e) => setRamp(+e.target.value)}
                  className={sliderCls}
                />
              </div>
            </div>

            {/* Horizon */}
            <div className="rounded-lg border p-3.5">
              <div className="mb-2.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                Horizon
              </div>
              <div className="flex gap-1.5">
                {[
                  { h: restOfYearCount, label: `Rest of ${curYear}` },
                  { h: 12, label: "Full 12 months" },
                ].map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    onClick={() => setHorizon(o.h)}
                    className={cn(
                      "flex-1 rounded-md border px-2 py-1.5 text-[11px] font-bold transition-colors",
                      horizon === o.h
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Revenue averages */}
            <div className="rounded-lg border p-3.5">
              <div className="mb-3 text-[10.5px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Revenue averages (real numbers)
              </div>

              <div className="mb-3.5">
                <label className="mb-1.5 flex items-center justify-between text-[12.5px] font-semibold">
                  <span>Avg retainer / active client</span>
                  <span className="tabular-nums text-primary">{full(retainer)}</span>
                </label>
                <input
                  type="range"
                  aria-label="Average retainer per active client (dollars)"
                  min={0}
                  max={retainerMax}
                  step={100}
                  value={retainer}
                  onChange={(e) => setRetainer(+e.target.value)}
                  className={sliderCls}
                />
                <button
                  type="button"
                  disabled={!baseline}
                  onClick={() => baseline && setRetainer(baseline.averageMrr)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Database className="h-3 w-3" />
                  {baseline
                    ? `Use live avg MRR (${full(baseline.averageMrr)})`
                    : isFetching
                      ? "Loading live…"
                      : "Live data unavailable"}
                </button>
              </div>

              <div className="mb-3.5">
                <label className="mb-1.5 flex items-center justify-between text-[12.5px] font-semibold">
                  <span>Avg new-account first billing</span>
                  <span className="tabular-nums text-primary">{full(newbill)}</span>
                </label>
                <input
                  type="range"
                  aria-label="Average new-account first billing (dollars)"
                  min={0}
                  max={15000}
                  step={100}
                  value={newbill}
                  onChange={(e) => setNewbill(+e.target.value)}
                  className={sliderCls}
                />
              </div>

              <div>
                <label className="mb-1.5 flex items-center justify-between text-[12.5px] font-semibold">
                  <span>Performance fee / rebilling client</span>
                  <span className="tabular-nums text-primary">{fee === 0 ? "Off" : full(fee)}</span>
                </label>
                <input
                  type="range"
                  aria-label="Performance fee per rebilling client (dollars)"
                  min={0}
                  max={15000}
                  step={250}
                  value={fee}
                  onChange={(e) => setFee(+e.target.value)}
                  className={sliderCls}
                />
                <div className="mt-2 flex gap-1.5">
                  {feePresets.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFee(f)}
                      className={cn(
                        "flex-1 rounded-md border px-2 py-1.5 text-[11px] font-bold transition-colors",
                        fee === f
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {f === 0 ? "Off" : "$" + f / 1000 + "K"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Costs */}
            <div className="rounded-lg border p-3.5">
              <div className="mb-3 text-[10.5px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                Costs
              </div>
              <div>
                <label className="mb-1.5 flex items-center justify-between text-[12.5px] font-semibold">
                  <span>Monthly operating expenses</span>
                  <span className="tabular-nums text-primary">{full(expenses)}</span>
                </label>
                <input
                  type="range"
                  aria-label="Fixed monthly operating expenses (dollars)"
                  min={0}
                  max={EXPENSES_MAX}
                  step={5000}
                  value={expenses}
                  onChange={(e) => setExpenses(+e.target.value)}
                  className={sliderCls}
                />
                <p className="mt-1.5 text-[11px] text-muted-foreground/70">
                  Flat overhead per month — does not scale with the book.
                </p>
              </div>
            </div>
          </div>

          {/* Output + revenue chart */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Out
                label="End active book"
                value={`${endBook}`}
                sub="clients"
                tone={endBook >= start ? SERIES.good : SERIES.perf}
              />
              <Out label="End monthly revenue" value={fmt(endRev)} sub="final month" />
              <Out label="Cumulative revenue" value={fmt(cumRev)} sub={`over ${horizon} mo`} tone={SERIES.good} />
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={revData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: colors.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: colors.grid }} />
                  <YAxis tickFormatter={fmt} tick={{ fill: colors.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
                  <Tooltip content={(p) => (
                    <ChartTooltip active={p.active} payload={p.payload as never} label={p.label} colors={colors} unit="money" />
                  )} cursor={{ fill: colors.grid, opacity: 0.25 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                  <Bar dataKey="Retainer" stackId="r" fill={SERIES.retainer} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="New accounts" stackId="r" fill={SERIES.newAcct} />
                  <Bar dataKey="Performance fees" stackId="r" fill={SERIES.perf} radius={[3, 3, 0, 0]} />
                  <Line type="monotone" dataKey="Net profit" stroke={SERIES.good} strokeWidth={2.6} dot={{ r: 2.5 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Book + scenarios */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">Active client book</h3>
          <p className="mb-3 text-[12.5px] text-muted-foreground/70">Retained + newly won, month by month</p>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={bookData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: colors.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: colors.grid }} />
                <YAxis tick={{ fill: colors.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                <Tooltip content={(p) => (
                  <ChartTooltip active={p.active} payload={p.payload as never} label={p.label} colors={colors} unit="clients" />
                )} />
                <Line type="monotone" dataKey="Active book" stroke={SERIES.retainer} strokeWidth={2.4} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">Revenue scenarios by retention</h3>
          <p className="mb-3 text-[12.5px] text-muted-foreground/70">
            Monthly revenue at 7% / 65% / 80% retention (same averages &amp; new-accounts pace)
          </p>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={scen} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: colors.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: colors.grid }} />
                <YAxis tickFormatter={fmt} tick={{ fill: colors.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
                <Tooltip content={(p) => (
                  <ChartTooltip active={p.active} payload={p.payload as never} label={p.label} colors={colors} unit="money" />
                )} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                <Line type="monotone" dataKey="80% retention" stroke={SERIES.good} strokeWidth={2.4} dot={false} />
                <Line type="monotone" dataKey="65% baseline" stroke={SERIES.retainer} strokeWidth={2.4} dot={false} />
                <Line type="monotone" dataKey="~7% (today)" stroke={SERIES.bad} strokeWidth={2} strokeDasharray="5 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Month-by-month table */}
      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">Month-by-month projection</h3>
        <p className="mb-3 text-[12.5px] text-muted-foreground/70">
          Active book = retained + new · Revenue = retainer + new-account billings + performance fees
        </p>
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[12.5px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="border-b-2 px-2 py-2 text-left">Month</th>
                <th className="border-b-2 px-2 py-2 text-right">Start</th>
                <th className="border-b-2 px-2 py-2 text-right">Retained</th>
                <th className="border-b-2 px-2 py-2 text-right">New</th>
                <th className="border-b-2 px-2 py-2 text-right">End book</th>
                <th className="border-b-2 px-2 py-2 text-right">Index</th>
                <th className="border-b-2 px-2 py-2 text-right">Retainer $</th>
                <th className="border-b-2 px-2 py-2 text-right">New $</th>
                <th className="border-b-2 px-2 py-2 text-right">Perf $</th>
                <th className="border-b-2 px-2 py-2 text-right">Total rev</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const idxTone =
                  r.index >= 100 ? "text-emerald-600 dark:text-emerald-400" : r.index >= 90 ? "text-muted-foreground" : "text-red-500";
                return (
                  <tr key={i} className="border-b">
                    <td className="px-2 py-2">
                      {r.label} &apos;{String(r.year).slice(2)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.startA}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.retained}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">+{r.newWon}</td>
                    <td className="px-2 py-2 text-right font-bold tabular-nums">{r.end}</td>
                    <td className={cn("px-2 py-2 text-right font-medium tabular-nums", idxTone)}>{r.index}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground/70">{fmt(r.retRev)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground/70">{fmt(r.newRev)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground/70">{fmt(r.perfRev)}</td>
                    <td className="px-2 py-2 text-right font-bold tabular-nums">{fmt(r.totRev)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td className="px-2 py-2">Total</td>
                <td colSpan={5} />
                <td className="px-2 py-2 text-right tabular-nums">{fmt(rows.reduce((a, b) => a + b.retRev, 0))}</td>
                <td className="px-2 py-2 text-right tabular-nums">{fmt(rows.reduce((a, b) => a + b.newRev, 0))}</td>
                <td className="px-2 py-2 text-right tabular-nums">{fmt(rows.reduce((a, b) => a + b.perfRev, 0))}</td>
                <td className="px-2 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{fmt(cumRev)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Takeaway */}
      <div className="rounded-xl border-l-4 border-l-amber-500 bg-amber-500/5 p-4">
        <h4 className="text-sm font-semibold text-foreground">The takeaway</h4>
        <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">
          {takeaway} Cumulative {horizon}-month revenue: <b>{fmt(cumRev)}</b>.
        </p>
      </div>

      <p className="flex items-center gap-1.5 pt-1 text-[11.5px] text-muted-foreground/60">
        <TrendingUp className="h-3.5 w-3.5" />
        Projections are illustrative planning figures, not guarantees. Baselines pull from the Client Directory&apos;s
        active clients{baseline ? ` (${baseline.activeClientCount} active, ${full(baseline.averageMrr)} avg MRR)` : ""}
        {isFetching ? " · refreshing…" : ""}.
      </p>
    </div>
  );
}
