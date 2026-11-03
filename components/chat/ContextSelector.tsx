"use client";

import { memo, useMemo, useState } from "react";
import { ChevronRight, Loader2, Search, X } from "lucide-react";
import { cn, formatRoas } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { useAccounts } from "@/hooks/useAccounts";
import { useCampaigns } from "@/hooks/useCampaigns";
import { BadgeDot, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { metaStatusLabel, metaStatusTone } from "@/components/overview/metaStatus";
import type { DateRangeInput } from "@/types/api";
import type { AccountSummary } from "@/types/dashboard";

interface ContextSelectorProps {
  dateRange: DateRangeInput;
  selectedAccountIds: string[];
  selectedCampaignIds: string[];
  onAccountToggle: (id: string) => void;
  /** Ticking a campaign also puts its account in context (the server only reads campaigns of context accounts). */
  onCampaignToggle: (campaignId: string, accountId: string) => void;
  /** Select these accounts (the currently filtered list). */
  onSelectAll: (accountIds: string[]) => void;
  onClearAll: () => void;
  /** Selected campaigns per account id (shown on the account row). */
  campaignCountByAccount?: Record<string, number>;
  className?: string;
}

type StatusFilter = "all" | "active" | "inactive";

const SPEND_TIERS = [
  { label: "Any spend", value: "0" },
  { label: "$1K+", value: "1000" },
  { label: "$5K+", value: "5000" },
] as const;

function AccountCampaigns({
  account,
  dateRange,
  selectedCampaignIds,
  onCampaignToggle,
}: {
  account: AccountSummary;
  dateRange: DateRangeInput;
  selectedCampaignIds: string[];
  onCampaignToggle: (campaignId: string, accountId: string) => void;
}) {
  const { data: campaigns, isLoading, isError } = useCampaigns(account.id, dateRange);
  const [showAll, setShowAll] = useState(false);

  const sorted = useMemo(
    () => [...(campaigns ?? [])].sort((a, b) => b.insights.spend - a.insights.spend),
    [campaigns]
  );

  if (isLoading) {
    return (
      <div className="space-y-2 px-3 pb-3">
        <Skeleton className="h-8 w-full rounded-2xl" />
        <Skeleton className="h-8 w-full rounded-2xl" />
      </div>
    );
  }
  if (isError) return <p className="px-3 pb-3 text-xs text-destructive">Couldn&apos;t load campaigns.</p>;
  if (sorted.length === 0) return <p className="px-3 pb-3 text-xs text-muted-foreground">No campaigns in this period.</p>;

  const visible = showAll ? sorted : sorted.slice(0, 10);

  return (
    <div className="space-y-0.5 px-1.5 pb-2">
      {visible.map((campaign) => {
        const checked = selectedCampaignIds.includes(campaign.id);
        const id = `ctx-c-${campaign.id}`;
        return (
          <div key={campaign.id} className={cn("flex items-start gap-2.5 rounded-2xl px-2 py-1.5 hover:bg-muted/60", checked && "bg-muted/60")}>
            <Checkbox
              id={id}
              checked={checked}
              onCheckedChange={() => onCampaignToggle(campaign.id, account.id)}
              className="mt-0.5"
            />
            <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
              <span className="flex items-center gap-1.5">
                <BadgeDot tone={metaStatusTone(campaign.status)} />
                <span className="truncate text-xs font-medium" title={campaign.name}>
                  {campaign.name}
                </span>
              </span>
              <span className="block text-[11px] tabular-nums text-muted-foreground">
                {formatCurrency(campaign.insights.spend, account.currency)} · {formatRoas(campaign.insights.roas)} ROAS
                {campaign.status !== "ACTIVE" && ` · ${metaStatusLabel(campaign.status)}`}
              </span>
            </label>
          </div>
        );
      })}
      {sorted.length > 10 && (
        <Button variant="ghost" size="xs" className="ml-1 text-muted-foreground" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show top 10" : `Show all ${sorted.length} campaigns`}
        </Button>
      )}
    </div>
  );
}

const AccountRow = memo(function AccountRow({
  account,
  dateRange,
  isSelected,
  selectedCampaignCount,
  selectedCampaignIds,
  onAccountToggle,
  onCampaignToggle,
}: {
  account: AccountSummary;
  dateRange: DateRangeInput;
  isSelected: boolean;
  selectedCampaignCount: number;
  selectedCampaignIds: string[];
  onAccountToggle: (id: string) => void;
  onCampaignToggle: (campaignId: string, accountId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = `ctx-a-${account.id}`;

  return (
    <div className={cn("rounded-3xl ring-1 transition-colors", isSelected ? "bg-muted/50 ring-foreground/15" : "ring-foreground/5 hover:bg-muted/30")}>
      <div className="flex items-start gap-3 p-3">
        <Checkbox id={id} checked={isSelected} onCheckedChange={() => onAccountToggle(account.id)} className="mt-0.5" />
        <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium" title={account.name}>
              {account.name}
            </span>
            <StatusBadge tone={metaStatusTone(account.status)} className="shrink-0">
              {metaStatusLabel(account.status)}
            </StatusBadge>
          </span>
          <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
            {formatCurrency(account.insights.spend, account.currency)} · {formatRoas(account.insights.roas)} ROAS
            {selectedCampaignCount > 0 && ` · ${selectedCampaignCount} campaign${selectedCampaignCount === 1 ? "" : "s"}`}
          </span>
        </label>
        <Button
          variant="ghost"
          size="icon-xs"
          className="-mr-1 shrink-0 text-muted-foreground"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? `Hide campaigns of ${account.name}` : `Show campaigns of ${account.name}`}
        >
          <ChevronRight className={cn("transition-transform", expanded && "rotate-90")} />
        </Button>
      </div>
      {expanded && (
        <AccountCampaigns
          account={account}
          dateRange={dateRange}
          selectedCampaignIds={selectedCampaignIds}
          onCampaignToggle={onCampaignToggle}
        />
      )}
    </div>
  );
});

/**
 * Picks which accounts / campaigns the analyst reads. Nothing selected =
 * every active account. Fills its container (scrolls internally). Memoized:
 * the chat re-renders many times a second while a reply streams.
 */
export const ContextSelector = memo(function ContextSelector({
  dateRange,
  selectedAccountIds,
  selectedCampaignIds,
  onAccountToggle,
  onCampaignToggle,
  onSelectAll,
  onClearAll,
  campaignCountByAccount,
  className,
}: ContextSelectorProps) {
  const { data: accounts, isLoading, isError } = useAccounts(dateRange);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [minSpend, setMinSpend] = useState("0");

  const filteredAccounts = useMemo(() => {
    if (!accounts) return [];
    const q = search.trim().toLowerCase();
    return accounts.filter((a) => {
      const isActive = a.status === "ACTIVE";
      return (
        (a.name ?? "").toLowerCase().includes(q) &&
        (statusFilter === "all" || (statusFilter === "active" ? isActive : !isActive)) &&
        a.insights.spend >= Number(minSpend)
      );
    });
  }, [accounts, search, statusFilter, minSpend]);

  const selectedSet = useMemo(() => new Set(selectedAccountIds), [selectedAccountIds]);
  const hasSelection = selectedAccountIds.length > 0 || selectedCampaignIds.length > 0;
  const allVisibleSelected = filteredAccounts.length > 0 && filteredAccounts.every((a) => selectedSet.has(a.id));

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="space-y-3 p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium">Data context</p>
            <p className="text-xs text-muted-foreground">
              {hasSelection
                ? [
                    selectedAccountIds.length > 0 && `${selectedAccountIds.length} account${selectedAccountIds.length === 1 ? "" : "s"}`,
                    selectedCampaignIds.length > 0 && `${selectedCampaignIds.length} campaign${selectedCampaignIds.length === 1 ? "" : "s"}`,
                  ]
                    .filter(Boolean)
                    .join(" · ") + " selected"
                : "All active accounts"}
            </p>
          </div>
          {hasSelection && (
            <Button variant="ghost" size="xs" onClick={onClearAll} className="-mr-1 shrink-0 text-muted-foreground">
              Clear
            </Button>
          )}
        </div>

        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search accounts"
            aria-label="Search accounts"
            className="pl-9 pr-9"
          />
          {search && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              <X />
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <ToggleGroup
            type="single"
            size="sm"
            value={statusFilter}
            onValueChange={(v) => v && setStatusFilter(v as StatusFilter)}
            aria-label="Account status"
          >
            <ToggleGroupItem value="all" className="text-xs">All</ToggleGroupItem>
            <ToggleGroupItem value="active" className="gap-1.5 text-xs">
              <BadgeDot tone="success" />
              Active
            </ToggleGroupItem>
            <ToggleGroupItem value="inactive" className="gap-1.5 text-xs">
              <BadgeDot tone="neutral" />
              Inactive
            </ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup
            type="single"
            size="sm"
            value={minSpend}
            onValueChange={(v) => v && setMinSpend(v)}
            aria-label="Minimum spend"
          >
            {SPEND_TIERS.map((tier) => (
              <ToggleGroupItem key={tier.value} value={tier.value} className="text-xs">
                {tier.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-4">
        {isLoading ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[66px] w-full rounded-3xl" />)
        ) : isError ? (
          <p className="py-6 text-center text-xs text-destructive">Couldn&apos;t load accounts.</p>
        ) : filteredAccounts.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {accounts?.length === 0 ? "No ad accounts connected." : "No accounts match these filters."}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
              <span>
                {filteredAccounts.length} account{filteredAccounts.length === 1 ? "" : "s"}
              </span>
              {!allVisibleSelected && (
                <Button
                  variant="link"
                  size="xs"
                  className="h-auto px-0 text-xs text-muted-foreground"
                  onClick={() => onSelectAll(filteredAccounts.map((a) => a.id))}
                >
                  Select {filteredAccounts.length === accounts?.length ? "all" : "these"}
                </Button>
              )}
            </div>
            {filteredAccounts.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                dateRange={dateRange}
                isSelected={selectedSet.has(account.id)}
                selectedCampaignCount={campaignCountByAccount?.[account.id] ?? 0}
                selectedCampaignIds={selectedCampaignIds}
                onAccountToggle={onAccountToggle}
                onCampaignToggle={onCampaignToggle}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
});
