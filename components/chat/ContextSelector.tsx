"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Check, Loader2, Search, X, Sparkles } from "lucide-react";
import { cn, formatCurrency, formatRoas } from "@/lib/utils";
import { useAccounts } from "@/hooks/useAccounts";
import { useCampaigns } from "@/hooks/useCampaigns";
import type { DateRangeInput } from "@/types/api";
import type { AccountSummary } from "@/types/dashboard";

interface ContextSelectorProps {
  dateRange: DateRangeInput;
  selectedAccountIds: string[];
  selectedCampaignIds: string[];
  onAccountToggle: (id: string) => void;
  onCampaignToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}

function AccountCampaigns({
  account,
  dateRange,
  selectedCampaignIds,
  onCampaignToggle,
}: {
  account: AccountSummary;
  dateRange: DateRangeInput;
  selectedCampaignIds: string[];
  onCampaignToggle: (id: string) => void;
}) {
  const { data: campaigns, isLoading } = useCampaigns(account.id, dateRange);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading campaigns...
      </div>
    );
  }

  if (!campaigns || campaigns.length === 0) {
    return (
      <p className="px-3 py-2 text-xs text-muted-foreground">No campaigns found</p>
    );
  }

  return (
    <div className="space-y-0.5">
      {campaigns.slice(0, 10).map((campaign) => {
        const isSelected = selectedCampaignIds.includes(campaign.id);
        return (
          <button
            key={campaign.id}
            onClick={() => onCampaignToggle(campaign.id)}
            className={cn(
              "flex w-full items-start gap-2 rounded-md px-3 py-1.5 text-left transition-colors hover:bg-muted/50",
              isSelected && "bg-primary/10"
            )}
          >
            <div
              className={cn(
                "mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors",
                isSelected ? "border-primary bg-primary" : "border-muted-foreground/40"
              )}
            >
              {isSelected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground/90">{campaign.name}</p>
              <p className="text-[10px] text-muted-foreground">
                {formatCurrency(campaign.insights.spend)} · {formatRoas(campaign.insights.roas)} ROAS
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function AccountRow({
  account,
  dateRange,
  isSelected,
  selectedCampaignIds,
  onAccountToggle,
  onCampaignToggle,
}: {
  account: AccountSummary;
  dateRange: DateRangeInput;
  isSelected: boolean;
  selectedCampaignIds: string[];
  onAccountToggle: (id: string) => void;
  onCampaignToggle: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border/50 overflow-hidden">
      <div
        className={cn(
          "flex items-center gap-2 p-2.5 transition-colors",
          isSelected && "bg-primary/10"
        )}
      >
        <button
          onClick={() => onAccountToggle(account.id)}
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
            isSelected ? "border-primary bg-primary" : "border-muted-foreground/40 hover:border-primary"
          )}
        >
          {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
        </button>

        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onAccountToggle(account.id)}>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                account.status === "ACTIVE" ? "bg-green-500" : "bg-muted-foreground/40"
              )}
            />
            <p className="truncate text-xs font-semibold text-foreground">{account.name}</p>
          </div>
          <div className="flex items-center gap-1.5 pl-3">
            <p className="text-[10px] text-muted-foreground">
              {formatCurrency(account.insights.spend)} · {formatRoas(account.insights.roas)} ROAS
            </p>
            {isSelected && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-primary">
                <Sparkles className="h-2 w-2" />
                AI
              </span>
            )}
          </div>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
          title={expanded ? "Collapse campaigns" : "Expand campaigns"}
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border/50 bg-muted/20 py-1">
          <AccountCampaigns
            account={account}
            dateRange={dateRange}
            selectedCampaignIds={selectedCampaignIds}
            onCampaignToggle={onCampaignToggle}
          />
        </div>
      )}
    </div>
  );
}

type StatusFilter = "all" | "active" | "inactive";

const SPEND_TIERS = [
  { label: "Any", value: 0 },
  { label: "$1K+", value: 1_000 },
  { label: "$5K+", value: 5_000 },
  { label: "$10K+", value: 10_000 },
  { label: "$50K+", value: 50_000 },
] as const;

export function ContextSelector({
  dateRange,
  selectedAccountIds,
  selectedCampaignIds,
  onAccountToggle,
  onCampaignToggle,
  onSelectAll,
  onClearAll,
}: ContextSelectorProps) {
  const { data: accounts, isLoading } = useAccounts(dateRange);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [minSpend, setMinSpend] = useState(0);

  const totalSelected = selectedAccountIds.length + selectedCampaignIds.length;

  const filteredAccounts = useMemo(() => {
    if (!accounts) return [];
    return accounts.filter((a) => {
      const matchesSearch = a.name.toLowerCase().includes(search.toLowerCase());
      const isActive = a.status === "ACTIVE";
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && isActive) ||
        (statusFilter === "inactive" && !isActive);
      const matchesSpend = a.insights.spend >= minSpend;
      return matchesSearch && matchesStatus && matchesSpend;
    });
  }, [accounts, search, statusFilter, minSpend]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border p-4">
        <h2 className="text-sm font-semibold text-foreground">Context</h2>
        {totalSelected === 0 ? (
          <p className="mt-0.5 text-xs text-muted-foreground">Analyzing all accounts</p>
        ) : (
          <div className="mt-1.5 flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1">
            <Sparkles className="h-3 w-3 shrink-0 text-primary" />
            <p className="text-[11px] font-medium text-primary">
              {selectedAccountIds.length} account{selectedAccountIds.length !== 1 ? "s" : ""} in AI context
            </p>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
          <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search accounts…"
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Status toggle + Select/Clear */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center rounded-md border border-border bg-muted/30 p-0.5">
          {(["all", "active", "inactive"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "rounded px-2 py-0.5 text-[10px] font-medium capitalize transition-colors",
                statusFilter === s
                  ? s === "active"
                    ? "bg-green-500/20 text-green-600 dark:text-green-400"
                    : s === "inactive"
                    ? "bg-muted text-foreground"
                    : "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <button
            onClick={onSelectAll}
            className="rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            All
          </button>
          <button
            onClick={onClearAll}
            className="rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Spend filter */}
      <div className="border-b border-border px-3 py-2">
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Min spend
        </p>
        <div className="flex flex-wrap gap-1">
          {SPEND_TIERS.map((tier) => (
            <button
              key={tier.value}
              onClick={() => setMinSpend(tier.value)}
              className={cn(
                "rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors",
                minSpend === tier.value
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border bg-transparent text-muted-foreground hover:border-border hover:text-foreground"
              )}
            >
              {tier.label}
            </button>
          ))}
        </div>
        {minSpend > 0 && accounts && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            {filteredAccounts.length} of {accounts.length} accounts
          </p>
        )}
      </div>

      {/* Account list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading accounts...
          </div>
        ) : filteredAccounts.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            {accounts?.length === 0 ? "No accounts found" : "No accounts match filters"}
          </p>
        ) : (
          filteredAccounts.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              dateRange={dateRange}
              isSelected={selectedAccountIds.includes(account.id)}
              selectedCampaignIds={selectedCampaignIds}
              onAccountToggle={onAccountToggle}
              onCampaignToggle={onCampaignToggle}
            />
          ))
        )}
      </div>
    </div>
  );
}
