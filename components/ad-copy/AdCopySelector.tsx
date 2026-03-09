"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Loader2, Search, X, PenTool } from "lucide-react";
import { cn, formatCurrency, formatRoas } from "@/lib/utils";
import { useAccounts } from "@/hooks/useAccounts";
import { useCampaigns } from "@/hooks/useCampaigns";
import type { DateRangeInput } from "@/types/api";
import type { AccountSummary, CampaignRow } from "@/types/dashboard";

interface AdCopySelectorProps {
  dateRange: DateRangeInput;
  selectedAccountId: string | undefined;
  selectedCampaignId: string | undefined;
  onSelect: (accountId: string, campaignId: string) => void;
  onClear: () => void;
}

// ─── Campaign list for a single account ─────────────────────────────────────
function AccountCampaigns({
  account,
  dateRange,
  selectedCampaignId,
  onCampaignSelect,
}: {
  account: AccountSummary;
  dateRange: DateRangeInput;
  selectedCampaignId: string | undefined;
  onCampaignSelect: (accountId: string, campaignId: string) => void;
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

  // Sort by spend desc
  const sorted = [...campaigns].sort((a, b) => b.insights.spend - a.insights.spend);

  return (
    <div className="space-y-0.5">
      {sorted.map((campaign) => {
        const isSelected = selectedCampaignId === campaign.id;
        return (
          <button
            key={campaign.id}
            onClick={() => onCampaignSelect(account.id, campaign.id)}
            className={cn(
              "flex w-full items-start gap-2 rounded-md px-3 py-1.5 text-left transition-colors hover:bg-muted/50",
              isSelected && "bg-primary/10"
            )}
          >
            {/* Radio dot */}
            <div
              className={cn(
                "mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                isSelected ? "border-primary" : "border-muted-foreground/40"
              )}
            >
              {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-primary" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground/90">{campaign.name}</p>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span
                  className={cn(
                    "inline-block h-1.5 w-1.5 rounded-full",
                    campaign.status === "ACTIVE" ? "bg-green-500" : "bg-muted-foreground/40"
                  )}
                />
                <span>{campaign.status.charAt(0) + campaign.status.slice(1).toLowerCase()}</span>
                <span>·</span>
                <span>{formatCurrency(campaign.insights.spend)}</span>
                <span>·</span>
                <span>{formatRoas(campaign.insights.roas)} ROAS</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Account row with expandable campaigns ──────────────────────────────────
function AccountRow({
  account,
  dateRange,
  isExpanded,
  isAccountSelected,
  selectedCampaignId,
  onToggleExpand,
  onCampaignSelect,
}: {
  account: AccountSummary;
  dateRange: DateRangeInput;
  isExpanded: boolean;
  isAccountSelected: boolean;
  selectedCampaignId: string | undefined;
  onToggleExpand: () => void;
  onCampaignSelect: (accountId: string, campaignId: string) => void;
}) {
  return (
    <div className={cn(
      "rounded-lg border overflow-hidden transition-colors",
      isAccountSelected ? "border-primary/40" : "border-border/50"
    )}>
      <button
        onClick={onToggleExpand}
        className={cn(
          "flex w-full items-center gap-2 p-2.5 text-left transition-colors hover:bg-muted/30",
          isAccountSelected && "bg-primary/5"
        )}
      >
        {/* Expand icon */}
        <div className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </div>

        <div className="min-w-0 flex-1">
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
            {isAccountSelected && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-primary">
                <PenTool className="h-2 w-2" />
                Selected
              </span>
            )}
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-border/50 bg-muted/20 py-1 max-h-[280px] overflow-y-auto">
          <AccountCampaigns
            account={account}
            dateRange={dateRange}
            selectedCampaignId={selectedCampaignId}
            onCampaignSelect={onCampaignSelect}
          />
        </div>
      )}
    </div>
  );
}

// ─── Filters ────────────────────────────────────────────────────────────────
type StatusFilter = "all" | "active" | "inactive";

const SPEND_TIERS = [
  { label: "Any", value: 0 },
  { label: "$1K+", value: 1_000 },
  { label: "$5K+", value: 5_000 },
  { label: "$10K+", value: 10_000 },
  { label: "$50K+", value: 50_000 },
] as const;

// ─── Main selector ──────────────────────────────────────────────────────────
export function AdCopySelector({
  dateRange,
  selectedAccountId,
  selectedCampaignId,
  onSelect,
  onClear,
}: AdCopySelectorProps) {
  const { data: accounts, isLoading } = useAccounts(dateRange);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [minSpend, setMinSpend] = useState(0);
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);

  const selectedAccount = accounts?.find((a) => a.id === selectedAccountId);
  const selectedCampaign = useCampaigns(selectedAccountId, dateRange).data?.find(
    (c) => c.id === selectedCampaignId
  );

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

  function handleCampaignSelect(accountId: string, campaignId: string) {
    onSelect(accountId, campaignId);
  }

  function handleToggleExpand(accountId: string) {
    setExpandedAccountId((prev) => (prev === accountId ? null : accountId));
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border p-4">
        <h2 className="text-sm font-semibold text-foreground">Select Campaign</h2>
        {!selectedCampaignId ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Choose an account, then pick a campaign
          </p>
        ) : (
          <div className="mt-1.5 space-y-1">
            <div className="flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1">
              <PenTool className="h-3 w-3 shrink-0 text-primary" />
              <p className="text-[11px] font-medium text-primary truncate">
                {selectedAccount?.name}
              </p>
            </div>
            <div className="flex items-center justify-between rounded-md bg-muted/50 px-2 py-1">
              <p className="text-[11px] font-medium text-foreground truncate flex-1 mr-2">
                {selectedCampaign?.name ?? selectedCampaignId}
              </p>
              <button
                onClick={onClear}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                title="Clear selection"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
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
            placeholder="Search accounts..."
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Status toggle */}
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
              isExpanded={expandedAccountId === account.id}
              isAccountSelected={selectedAccountId === account.id}
              selectedCampaignId={selectedAccountId === account.id ? selectedCampaignId : undefined}
              onToggleExpand={() => handleToggleExpand(account.id)}
              onCampaignSelect={handleCampaignSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}
