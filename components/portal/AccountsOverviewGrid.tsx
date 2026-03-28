"use client";

import { useMemo } from "react";
import { DollarSign, TrendingUp, ShoppingCart, Layers } from "lucide-react";
import { cn, formatCurrency, formatRoas } from "@/lib/utils";
import { aggregateInsights } from "@/lib/meta/transformers";
import type { AccountOverview } from "@/hooks/useAllAccountsOverview";

export const ALL_ACCOUNTS_ID = "__all__";

interface AccountsOverviewGridProps {
  accounts: AccountOverview[];
  selectedAccountId?: string;
  onSelectAccount: (accountId: string) => void;
}

export function AccountsOverviewGrid({ accounts, selectedAccountId, onSelectAccount }: AccountsOverviewGridProps) {
  if (accounts.length <= 1) return null;

  const aggregated = useMemo(
    () => aggregateInsights(accounts.map((a) => a.metrics)),
    [accounts]
  );

  const isAllSelected = selectedAccountId === ALL_ACCOUNTS_ID;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-bold text-foreground">Accounts</h2>
        <p className="text-xs text-muted-foreground">Select an account to view detailed performance, or view all combined.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* All Accounts combined card */}
        <button
          onClick={() => onSelectAccount(ALL_ACCOUNTS_ID)}
          className={cn(
            "text-left p-4 rounded-xl border transition-all",
            isAllSelected
              ? "border-primary/40 bg-primary/5 shadow-sm ring-1 ring-primary/20"
              : "border-border/50 dark:border-white/[0.06] bg-card hover:border-primary/30 hover:shadow-md"
          )}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Layers className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground truncate">All Accounts</p>
                <p className="text-[10px] text-muted-foreground">{accounts.length} accounts combined</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="flex items-center gap-1 mb-0.5">
                <DollarSign className="h-2.5 w-2.5 text-muted-foreground" />
                <p className="text-[9px] font-bold text-muted-foreground uppercase">Spend</p>
              </div>
              <p className="text-xs font-bold text-foreground">{formatCurrency(aggregated.spend)}</p>
            </div>
            <div>
              <div className="flex items-center gap-1 mb-0.5">
                <TrendingUp className="h-2.5 w-2.5 text-muted-foreground" />
                <p className="text-[9px] font-bold text-muted-foreground uppercase">ROAS</p>
              </div>
              <p className="text-xs font-bold text-foreground">{formatRoas(aggregated.roas)}</p>
            </div>
            <div>
              <div className="flex items-center gap-1 mb-0.5">
                <ShoppingCart className="h-2.5 w-2.5 text-muted-foreground" />
                <p className="text-[9px] font-bold text-muted-foreground uppercase">Conv.</p>
              </div>
              <p className="text-xs font-bold text-foreground">
                {new Intl.NumberFormat("en-US").format(aggregated.conversions)}
              </p>
            </div>
          </div>
        </button>

        {/* Individual account cards */}
        {accounts.map((account) => {
          const isSelected = account.accountId === selectedAccountId;
          return (
            <button
              key={account.accountId}
              onClick={() => onSelectAccount(account.accountId)}
              className={cn(
                "text-left p-4 rounded-xl border transition-all",
                isSelected
                  ? "border-primary/40 bg-primary/5 shadow-sm ring-1 ring-primary/20"
                  : "border-border/50 dark:border-white/[0.06] bg-card hover:border-primary/30 hover:shadow-md"
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground truncate">
                    {account.label || account.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono truncate">
                    {account.accountId}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <span className={cn(
                    "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded",
                    account.status === "ACTIVE"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-red-500/10 text-red-600 dark:text-red-400"
                  )}>
                    {account.status}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <div className="flex items-center gap-1 mb-0.5">
                    <DollarSign className="h-2.5 w-2.5 text-muted-foreground" />
                    <p className="text-[9px] font-bold text-muted-foreground uppercase">Spend</p>
                  </div>
                  <p className="text-xs font-bold text-foreground">{formatCurrency(account.metrics.spend)}</p>
                </div>
                <div>
                  <div className="flex items-center gap-1 mb-0.5">
                    <TrendingUp className="h-2.5 w-2.5 text-muted-foreground" />
                    <p className="text-[9px] font-bold text-muted-foreground uppercase">ROAS</p>
                  </div>
                  <p className="text-xs font-bold text-foreground">{formatRoas(account.metrics.roas)}</p>
                </div>
                <div>
                  <div className="flex items-center gap-1 mb-0.5">
                    <ShoppingCart className="h-2.5 w-2.5 text-muted-foreground" />
                    <p className="text-[9px] font-bold text-muted-foreground uppercase">Conv.</p>
                  </div>
                  <p className="text-xs font-bold text-foreground">
                    {new Intl.NumberFormat("en-US").format(account.metrics.conversions)}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
