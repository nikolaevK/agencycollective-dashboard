"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { QueryErrorState } from "@/components/shared/QueryErrorState";
import { StatusBadge, badgeTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TOUCH_TARGET } from "@/components/ui/touch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { PeptideAiPolicy } from "@/lib/peptideAi";
import {
  PEPTIDE_AI_OFF_REASON_LABEL,
  PEPTIDE_AI_STATE_LABEL,
  formatCycleDate,
  formatUsd,
  type PeptideAiState,
  type PeptideAiUsage,
} from "@/lib/peptideAiPresentation";
import { PEPTIDE_AI_STATE_TONE, peptideAiMeterClass } from "./ClientPeptideAiCard";

interface Row {
  userId: string;
  displayName: string;
  workspace: string;
  policy: PeptideAiPolicy;
  usage: PeptideAiUsage | null;
  state: PeptideAiState;
}

interface Overview {
  configured: boolean;
  reachable: boolean;
  rows: Row[];
}

type Filter = "all" | "attention" | "never_opened" | "not_used" | "active" | "off";

const FILTERS: { id: Filter; label: string; match: (s: PeptideAiState) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "attention", label: "Near / at limit", match: (s) => s === "near_cap" || s === "capped" },
  { id: "never_opened", label: "Never opened", match: (s) => s === "never_opened" },
  { id: "not_used", label: "Not used yet", match: (s) => s === "not_used" },
  { id: "active", label: "Active", match: (s) => s === "active" },
  { id: "off", label: "Off / blocked", match: (s) => s === "off" || s === "blocked" },
];

// Who needs a look first: at the limit, then near it, then by spend.
const STATE_ORDER: PeptideAiState[] = [
  "capped",
  "near_cap",
  "blocked",
  "active",
  "not_used",
  "never_opened",
  "unknown",
  "off",
];

const spentOf = (r: Row) => (r.usage?.provisioned ? r.usage.spentCents : 0);

/**
 * Client Directory → Peptide AI: every client's spend against their monthly
 * budget, who's near or at the limit, and who never used it. Budgets and the
 * on/off switch are edited per client (Settings tab).
 */
export function PeptideAiUsageTab() {
  const [filter, setFilter] = useState<Filter>("all");
  const { data, isLoading, isError, refetch } = useQuery<Overview>({
    queryKey: ["admin-peptide-ai"],
    queryFn: async () => {
      const res = await fetch("/api/admin/clients/peptide-ai");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()).data as Overview;
    },
    staleTime: 60_000,
  });

  const rows = useMemo(() => {
    const match = FILTERS.find((f) => f.id === filter)!.match;
    return (data?.rows ?? [])
      .filter((r) => match(r.state))
      .sort(
        (a, b) =>
          STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) ||
          spentOf(b) - spentOf(a) ||
          a.displayName.localeCompare(b.displayName)
      );
  }, [data, filter]);

  if (isError) return <QueryErrorState onRetry={() => refetch()} />;
  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Loading Peptide AI usage…</p>;

  const on = data.rows.filter((r) => r.policy.enabled);
  const count = (s: PeptideAiState[]) => on.filter((r) => s.includes(r.state)).length;
  const totalSpent = on.reduce((sum, r) => sum + spentOf(r), 0);
  const cards = [
    { label: "Enabled clients", value: String(on.length) },
    { label: "Spent this cycle", value: formatUsd(totalSpent) },
    { label: "Near limit (80%+)", value: String(count(["near_cap"])) },
    { label: "Limit reached", value: String(count(["capped"])) },
    { label: "Never opened", value: String(count(["never_opened"])) },
  ];

  return (
    <div className="space-y-5">
      {!data.configured ? (
        <p className={cn("rounded-2xl border px-4 py-3 text-sm", badgeTone.warning)}>
          Peptide AI isn&apos;t connected on this deployment — set PEPTIDE_AI_URL and PEPTIDE_AI_SHARED_SECRET.
        </p>
      ) : (
        !data.reachable && (
          <p className={cn("rounded-2xl border px-4 py-3 text-sm", badgeTone.warning)}>
            Peptide AI didn&apos;t answer, so usage isn&apos;t shown. Budgets are still enforced there.
          </p>
        )
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {cards.map((c) => (
          <Card key={c.label} className="p-4">
            <p className="truncate text-xs text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums text-foreground">{c.value}</p>
          </Card>
        ))}
      </div>

      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={filter}
        onValueChange={(v) => {
          if (v) setFilter(v as Filter);
        }}
        aria-label="Filter clients"
        className="flex-wrap justify-start"
      >
        {FILTERS.map((f) => (
          <ToggleGroupItem key={f.id} value={f.id} className="px-3 text-xs">
            {f.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <Card>
        {/* Phones: no 720px floor and client names wrap (≥8rem), so Client +
            State fit the screen and the money columns scroll in from the right. */}
        <Table className="md:min-w-[720px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-4">Client</TableHead>
              <TableHead className="px-4">State</TableHead>
              <TableHead className="px-4">Spent / budget</TableHead>
              <TableHead className="px-4">Resets</TableHead>
              <TableHead className="px-4">Last used</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  No clients match.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const usage = r.usage?.provisioned ? r.usage : null;
              const cap = r.policy.capCents;
              const share = usage ? Math.min(1, usage.spentCents / cap) : 0;
              return (
                <TableRow key={r.userId}>
                  <TableCell className="px-4 max-md:whitespace-normal">
                    <Link
                      href={`/dashboard/users/${r.userId}?tab=settings`}
                      className={cn(
                        TOUCH_TARGET,
                        "font-medium text-foreground underline-offset-4 hover:underline max-md:inline-block max-md:min-w-[8rem] [@media(pointer:coarse)]:after:-inset-y-1.5"
                      )}
                    >
                      {r.displayName}
                    </Link>
                  </TableCell>
                  <TableCell className="px-4">
                    <StatusBadge tone={PEPTIDE_AI_STATE_TONE[r.state]}>
                      {r.state === "off" && r.policy.offReason
                        ? PEPTIDE_AI_OFF_REASON_LABEL[r.policy.offReason]
                        : PEPTIDE_AI_STATE_LABEL[r.state]}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="px-4">
                    <div className="min-w-[10rem] space-y-1">
                      <div className="flex items-baseline justify-between gap-2 text-xs tabular-nums">
                        <span className="font-medium text-foreground">{usage ? formatUsd(usage.spentCents) : "—"}</span>
                        <span className="text-muted-foreground">of {formatUsd(cap)}</span>
                      </div>
                      <Progress value={share * 100} className={cn("h-1.5", peptideAiMeterClass(r.state))} />
                    </div>
                  </TableCell>
                  <TableCell className="px-4 text-xs text-muted-foreground">
                    {usage?.periodEnd ? formatCycleDate(usage.periodEnd) : `day ${r.policy.anchorDay}`}
                  </TableCell>
                  <TableCell className="px-4 text-xs text-muted-foreground">
                    {usage?.lastActiveAt ? formatCycleDate(usage.lastActiveAt) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
