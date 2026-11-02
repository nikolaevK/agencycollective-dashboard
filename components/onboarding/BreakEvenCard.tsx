"use client";

import { cn } from "@/lib/utils";
import { formatCentsExact } from "@/lib/format";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { computeBreakEven, EXAMPLE_COSTS, type CostInputs } from "@/lib/onboardingForm";

/** Dollars (may be fractional) → "$1,234.56". */
const formatUsd = (dollars: number) => formatCentsExact(dollars * 100);

/**
 * Break-even ROAS / CPA / margin per order from the cost-per-order answers.
 * `showExample` (the client form) renders the dimmed example order until the
 * first number is typed; the admin view passes false and renders nothing.
 */
export function BreakEvenCard({ costs, showExample = false }: { costs: CostInputs; showExample?: boolean }) {
  const real = computeBreakEven(costs);
  const isExample = real.state === "empty" && showExample;
  const r = isExample ? computeBreakEven(EXAMPLE_COSTS) : real;
  if (r.state === "empty") return null;

  const losing = r.state === "ok" && r.contribution <= 0;
  const roas = r.state !== "ok" ? "—" : losing ? "n/a" : r.roas.toFixed(2);
  const cpa = r.state !== "ok" ? "—" : formatUsd(Math.max(0, r.contribution));
  const margin = r.state !== "ok" ? "—" : `${(r.margin * 100).toFixed(1)}%`;
  const leftOver =
    r.state !== "ok" ? "left over" : `${formatUsd(r.contribution)} ${losing ? "per order" : "left over"}`;
  const foot =
    r.state === "noaov"
      ? "Add your average order value to see your break-even ROAS."
      : losing
        ? "Costs are higher than the order value, so each order loses money before any ad spend. Send it anyway — we'll go through it on the kickoff call."
        : isExample
          ? "Fill in your numbers above and this updates live. Break-even ROAS = 1 ÷ (margin per order ÷ order value)."
          : `At ${roas} ROAS ads pay for themselves and nothing else. The real target sits above this so it covers fees and profit.`;

  return (
    <Card
      className={cn(isExample && "border border-dashed border-foreground/15 shadow-none ring-0")}
      aria-live="polite"
    >
      <div
        className={cn(
          "flex items-center justify-between gap-3 border-b px-4 py-3",
          isExample && "border-dashed border-foreground/15"
        )}
      >
        <span className="min-w-0 text-sm font-medium text-foreground">What you need to break even</span>
        {isExample ? (
          <StatusBadge tone="warning">Example numbers</StatusBadge>
        ) : (
          <Badge variant="secondary">Your numbers</Badge>
        )}
      </div>
      <div className={cn("grid grid-cols-2 sm:grid-cols-[1.3fr_1fr_1fr]", isExample && "[&_.v]:opacity-55")}>
        <div className="col-span-2 flex flex-col gap-1 border-b px-4 py-3.5 sm:col-span-1 sm:border-b-0">
          <span className="text-xs text-muted-foreground">Break-even ROAS</span>
          <span className="v text-4xl font-semibold leading-none tracking-tight tabular-nums text-foreground">{roas}</span>
          <span className="text-[11px] text-muted-foreground">Revenue per $1 of ad spend</span>
        </div>
        <div className="flex min-w-0 flex-col gap-1 px-4 py-3.5 sm:border-l">
          <span className="text-xs text-muted-foreground">Break-even CPA</span>
          <span className="v font-mono text-lg font-semibold tabular-nums text-foreground">{cpa}</span>
          <span className="text-[11px] text-muted-foreground">Max cost per order</span>
        </div>
        <div className="flex min-w-0 flex-col gap-1 border-l px-4 py-3.5">
          <span className="text-xs text-muted-foreground">Margin per order</span>
          <span className="v font-mono text-lg font-semibold tabular-nums text-foreground">{margin}</span>
          <span className="truncate text-[11px] text-muted-foreground">{leftOver}</span>
        </div>
      </div>
      <p
        className={cn(
          "border-t px-4 py-2.5 text-xs",
          losing
            ? "bg-red-500/[0.07] text-red-700 dark:bg-red-400/10 dark:text-red-300"
            : "bg-muted/40 text-muted-foreground"
        )}
      >
        {foot}
      </p>
    </Card>
  );
}
