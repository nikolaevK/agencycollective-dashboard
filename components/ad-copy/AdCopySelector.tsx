"use client";

import { useMemo, useState } from "react";
import { Check, ChevronRight, Search, X } from "lucide-react";
import { cn, formatCurrency, formatRoas } from "@/lib/utils";
import { useAccounts } from "@/hooks/useAccounts";
import { useCampaigns } from "@/hooks/useCampaigns";
import { Badge, BadgeDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { DateRangeInput } from "@/types/api";
import type { AccountSummary } from "@/types/dashboard";

interface AdCopySelectorProps {
  dateRange: DateRangeInput;
  selectedAccountId: string | undefined;
  selectedCampaignId: string | undefined;
  onSelect: (accountId: string, campaignId: string) => void;
  onClear: () => void;
}

function titleCase(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
}

// ─── Campaign list for one account ─────────────────────────────────────────
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
  const { data: campaigns, isLoading, isError } = useCampaigns(account.id, dateRange);

  if (isLoading) {
    return (
      <div className="space-y-1.5 px-2 py-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }
  if (isError) return <p className="px-3 py-2 text-xs text-destructive">Couldn&apos;t load campaigns.</p>;
  if (!campaigns || campaigns.length === 0) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">No campaigns in this period.</p>;
  }

  const sorted = [...campaigns].sort((a, b) => b.insights.spend - a.insights.spend);

  return (
    <ul className="space-y-0.5 py-1" role="list">
      {sorted.map((campaign) => {
        const isSelected = selectedCampaignId === campaign.id;
        const active = campaign.status === "ACTIVE";
        return (
          <li key={campaign.id}>
            <button
              type="button"
              onClick={() => onCampaignSelect(account.id, campaign.id)}
              aria-current={isSelected ? "true" : undefined}
              className={cn(
                "flex w-full items-start gap-2 rounded-2xl px-3 py-2 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/30",
                isSelected && "bg-muted"
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium" title={campaign.name}>
                  {campaign.name}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <BadgeDot tone={active ? "success" : "neutral"} />
                  {titleCase(campaign.status)}
                  <span aria-hidden>·</span>
                  <span className="tabular-nums">{formatCurrency(campaign.insights.spend)}</span>
                  <span aria-hidden>·</span>
                  <span className="tabular-nums">{formatRoas(campaign.insights.roas)}</span>
                </span>
              </span>
              {isSelected && <Check className="mt-0.5 size-4 shrink-0" aria-hidden />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Filters ────────────────────────────────────────────────────────────────
type StatusFilter = "all" | "active" | "inactive";

const SPEND_TIERS = [
  { label: "Any spend", value: "0" },
  { label: "$1K+", value: "1000" },
  { label: "$5K+", value: "5000" },
  { label: "$10K+", value: "10000" },
  { label: "$50K+", value: "50000" },
] as const;

// ─── Main selector ──────────────────────────────────────────────────────────
export function AdCopySelector({
  dateRange,
  selectedAccountId,
  selectedCampaignId,
  onSelect,
  onClear,
}: AdCopySelectorProps) {
  const { data: accounts, isLoading, isError } = useAccounts(dateRange);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [minSpend, setMinSpend] = useState("0");
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(selectedAccountId ?? null);

  const selectedAccount = accounts?.find((a) => a.id === selectedAccountId);
  const selectedCampaign = useCampaigns(selectedAccountId, dateRange).data?.find((c) => c.id === selectedCampaignId);

  const filteredAccounts = useMemo(() => {
    if (!accounts) return [];
    const q = search.trim().toLowerCase();
    const min = Number(minSpend);
    return accounts.filter((a) => {
      const isActive = a.status === "ACTIVE";
      return (
        a.name.toLowerCase().includes(q) &&
        (statusFilter === "all" || (statusFilter === "active") === isActive) &&
        a.insights.spend >= min
      );
    });
  }, [accounts, search, statusFilter, minSpend]);

  const filtered = accounts && filteredAccounts.length !== accounts.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 p-4 pb-3">
        <div>
          <h3 className="text-base font-semibold tracking-tight">Campaign</h3>
          <p className="text-xs text-muted-foreground">Pick an account, then a campaign.</p>
        </div>

        {selectedCampaignId && (
          <div className="flex items-start gap-2 rounded-2xl bg-muted/60 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-muted-foreground">{selectedAccount?.name ?? selectedAccountId}</p>
              <p className="truncate text-sm font-medium" title={selectedCampaign?.name}>
                {selectedCampaign?.name ?? selectedCampaignId}
              </p>
            </div>
            <Button type="button" variant="ghost" size="icon-xs" onClick={onClear} aria-label="Clear campaign selection">
              <X />
            </Button>
          </div>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search accounts…"
            aria-label="Search accounts"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
          <Select value={minSpend} onValueChange={setMinSpend}>
            <SelectTrigger className="h-8 w-auto min-w-[6.5rem] text-xs" aria-label="Minimum spend">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SPEND_TIERS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {filtered && (
          <p className="text-xs text-muted-foreground">
            {filteredAccounts.length} of {accounts?.length} accounts
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {isLoading ? (
          <div className="space-y-2 px-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <p className="px-3 py-6 text-center text-xs text-destructive">Couldn&apos;t load accounts.</p>
        ) : filteredAccounts.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {accounts?.length === 0 ? "No accounts found." : "No accounts match the filters."}
          </p>
        ) : (
          <ul className="space-y-1" role="list">
            {filteredAccounts.map((account) => {
              const expanded = expandedAccountId === account.id;
              const isSelected = selectedAccountId === account.id;
              return (
                <li key={account.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedAccountId(expanded ? null : account.id)}
                    aria-expanded={expanded}
                    className="flex w-full items-center gap-2 rounded-2xl px-2 py-2 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/30"
                  >
                    <ChevronRight
                      className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <BadgeDot tone={account.status === "ACTIVE" ? "success" : "neutral"} />
                        <span className="truncate text-sm font-medium" title={account.name}>
                          {account.name}
                        </span>
                      </span>
                      <span className="block pl-3 text-xs tabular-nums text-muted-foreground">
                        {formatCurrency(account.insights.spend)} · {formatRoas(account.insights.roas)} ROAS
                      </span>
                    </span>
                    {isSelected && (
                      <Badge variant="secondary" className="shrink-0">
                        Selected
                      </Badge>
                    )}
                  </button>
                  {expanded && (
                    <div className="ml-4 border-l pl-2">
                      <AccountCampaigns
                        account={account}
                        dateRange={dateRange}
                        selectedCampaignId={isSelected ? selectedCampaignId : undefined}
                        onCampaignSelect={onSelect}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
