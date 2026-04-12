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

function AccountCard({
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

  const statusColor = account.status === "ACTIVE"
    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
    : account.status === "PAUSED"
    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
    : "bg-muted text-muted-foreground";

  return (
    <div
      className={cn(
        "rounded-xl bg-card shadow-sm hover:shadow-md transition-shadow cursor-pointer border-l-4 overflow-hidden",
        isSelected ? "border-l-primary" : "border-l-transparent hover:border-l-primary/20"
      )}
      onClick={() => onAccountToggle(account.id)}
    >
      <div className="p-4">
        {/* Header: name + status */}
        <div className="flex justify-between items-start mb-3">
          <span className="text-xs font-bold text-foreground uppercase tracking-tight truncate pr-2">
            {account.name}
          </span>
          <span className={cn(
            "text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0",
            statusColor
          )}>
            {account.status}
          </span>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase font-semibold">ROAS</p>
            <p className="text-lg font-bold text-foreground">{formatRoas(account.insights.roas)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase font-semibold">Spend</p>
            <p className="text-lg font-bold text-foreground">{formatCurrency(account.insights.spend)}</p>
          </div>
        </div>

        {/* AI badge */}
        {isSelected && (
          <div className="flex items-center gap-1 mt-3">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
              <Sparkles className="h-2.5 w-2.5" />
              In AI Context
            </span>
          </div>
        )}
      </div>

      {/* Expand campaigns */}
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        className="flex w-full items-center justify-center gap-1 border-t border-border/50 py-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Campaigns
      </button>

      {expanded && (
        <div className="border-t border-border/50 bg-muted/10 py-1" onClick={(e) => e.stopPropagation()}>
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
      const matchesSearch = (a.name ?? "").toLowerCase().includes(search.trim().toLowerCase());
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
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="p-4 pb-3">
        {totalSelected === 0 ? (
          <p className="text-xs text-muted-foreground">Analyzing all accounts</p>
        ) : (
          <div className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5">
            <Sparkles className="h-3 w-3 shrink-0 text-primary" />
            <p className="text-[11px] font-medium text-primary">
              {selectedAccountIds.length} account{selectedAccountIds.length !== 1 ? "s" : ""} in AI context
            </p>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search accounts..."
            className="w-full pl-9 pr-8 py-2 bg-muted/30 border-none rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Status filter */}
      <div className="px-4 pb-2">
        <div className="flex gap-1.5 bg-muted/30 p-1 rounded-lg">
          {([
            { label: "All", value: "all" as StatusFilter, dot: "bg-primary" },
            { label: "Active", value: "active" as StatusFilter, dot: "bg-green-500" },
            { label: "Inactive", value: "inactive" as StatusFilter, dot: "bg-red-400" },
          ]).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all",
                statusFilter === opt.value
                  ? "bg-card shadow-sm font-semibold text-foreground"
                  : "text-muted-foreground hover:bg-card/50"
              )}
            >
              {opt.value !== "all" && (
                <span className={cn("h-1.5 w-1.5 rounded-full", opt.dot)} />
              )}
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Spend filter */}
      <div className="px-4 pb-3">
        <div className="flex gap-1 bg-muted/30 p-1 rounded-lg">
          {SPEND_TIERS.map((tier) => (
            <button
              key={tier.value}
              onClick={() => setMinSpend(tier.value)}
              className={cn(
                "flex-1 py-1.5 text-xs font-medium rounded-md transition-colors",
                minSpend === tier.value
                  ? "bg-card shadow-sm text-primary font-semibold"
                  : "text-muted-foreground hover:bg-card/50"
              )}
            >
              {tier.label}
            </button>
          ))}
        </div>
      </div>

      {/* Account list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 scrollbar-thin">
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
            <AccountCard
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
