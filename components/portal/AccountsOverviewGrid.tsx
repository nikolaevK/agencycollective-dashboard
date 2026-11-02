"use client";

import { useMemo } from "react";
import { Layers } from "lucide-react";
import { cn, formatCurrency, formatRoas } from "@/lib/utils";
import { aggregateInsights } from "@/lib/meta/transformers";
import { StatusBadge } from "@/components/ui/badge";
import { metaStatusLabel, metaStatusTone } from "@/components/overview/metaStatus";
import type { AccountOverview } from "@/hooks/useAllAccountsOverview";
import type { InsightMetrics } from "@/types/dashboard";

export const ALL_ACCOUNTS_ID = "__all__";

interface AccountsOverviewGridProps {
  accounts: AccountOverview[];
  selectedAccountId?: string;
  onSelectAccount: (accountId: string) => void;
}

/** Selectable account card — kit card look, a darker ring when selected. */
function cardClass(selected: boolean) {
  return cn(
    "flex min-w-0 flex-col gap-3 rounded-[min(calc(var(--radius)*2.6),24px)] bg-card p-4 text-left text-card-foreground shadow outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/30",
    selected
      ? "ring-2 ring-foreground/80"
      : "ring-1 ring-foreground/5 hover:bg-muted/50 dark:ring-foreground/10"
  );
}

function Metrics({ metrics }: { metrics: InsightMetrics }) {
  const items = [
    { label: "Spend", value: formatCurrency(metrics.spend) },
    { label: "ROAS", value: formatRoas(metrics.roas) },
    { label: "Conv.", value: new Intl.NumberFormat("en-US").format(metrics.conversions) },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <p className="text-xs text-muted-foreground">{item.label}</p>
          <p className="truncate text-sm font-semibold tabular-nums" title={item.value}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export function AccountsOverviewGrid({ accounts, selectedAccountId, onSelectAccount }: AccountsOverviewGridProps) {
  // Hooks must run unconditionally — the single-account early return comes after.
  const aggregated = useMemo(
    () => aggregateInsights(accounts.map((a) => a.metrics)),
    [accounts]
  );

  if (accounts.length <= 1) return null;

  const isAllSelected = selectedAccountId === ALL_ACCOUNTS_ID;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">Accounts</h2>
        <p className="text-sm text-muted-foreground">Select an account to view detailed performance, or view all combined.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* All Accounts combined card */}
        <button
          type="button"
          onClick={() => onSelectAccount(ALL_ACCOUNTS_ID)}
          aria-pressed={isAllSelected}
          className={cardClass(isAllSelected)}
        >
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">All Accounts</p>
              <p className="text-xs text-muted-foreground">{accounts.length} accounts combined</p>
            </div>
            <Layers className="size-4 shrink-0 text-muted-foreground" />
          </div>
          <Metrics metrics={aggregated} />
        </button>

        {/* Individual account cards */}
        {accounts.map((account) => {
          const isSelected = account.accountId === selectedAccountId;
          return (
            <button
              type="button"
              key={account.accountId}
              onClick={() => onSelectAccount(account.accountId)}
              aria-pressed={isSelected}
              className={cardClass(isSelected)}
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {account.label || account.name}
                  </p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {account.accountId}
                  </p>
                </div>
                <StatusBadge tone={metaStatusTone(account.status)} className="shrink-0">
                  {metaStatusLabel(account.status)}
                </StatusBadge>
              </div>
              <Metrics metrics={account.metrics} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
