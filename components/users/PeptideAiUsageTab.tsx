"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { QueryErrorState } from "@/components/shared/QueryErrorState";
import type { PeptideAiPolicy } from "@/lib/peptideAi";
import {
  PEPTIDE_AI_OFF_REASON_LABEL,
  PEPTIDE_AI_STATE_LABEL,
  formatCycleDate,
  formatUsd,
  type PeptideAiState,
  type PeptideAiUsage,
} from "@/lib/peptideAiPresentation";
import { PEPTIDE_AI_STATE_CLS } from "./ClientPeptideAiCard";

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
        <p className="rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          Peptide AI isn&apos;t connected on this deployment — set PEPTIDE_AI_URL and PEPTIDE_AI_SHARED_SECRET.
        </p>
      ) : (
        !data.reachable && (
          <p className="rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            Peptide AI didn&apos;t answer, so usage isn&apos;t shown. Budgets are still enforced there.
          </p>
        )
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-xl font-black tabular-nums text-foreground">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
              filter === f.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/50 dark:border-white/[0.06] bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border/50 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">State</th>
              <th className="px-4 py-3">Spent / budget</th>
              <th className="px-4 py-3">Resets</th>
              <th className="px-4 py-3">Last used</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  No clients match.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const usage = r.usage?.provisioned ? r.usage : null;
              const cap = r.policy.capCents;
              const share = usage ? Math.min(1, usage.spentCents / cap) : 0;
              return (
                <tr key={r.userId} className="border-b border-border/30 last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/users/${r.userId}?tab=settings`}
                      className="font-semibold text-foreground hover:text-primary"
                    >
                      {r.displayName}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", PEPTIDE_AI_STATE_CLS[r.state])}>
                      {r.state === "off" && r.policy.offReason
                        ? PEPTIDE_AI_OFF_REASON_LABEL[r.policy.offReason]
                        : PEPTIDE_AI_STATE_LABEL[r.state]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="min-w-[10rem] space-y-1">
                      <div className="flex items-baseline justify-between gap-2 text-xs tabular-nums">
                        <span className="font-medium text-foreground">{usage ? formatUsd(usage.spentCents) : "—"}</span>
                        <span className="text-muted-foreground">of {formatUsd(cap)}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            r.state === "capped" ? "bg-red-500" : r.state === "near_cap" ? "bg-amber-500" : "bg-primary"
                          )}
                          style={{ width: `${share * 100}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {usage?.periodEnd ? formatCycleDate(usage.periodEnd) : `day ${r.policy.anchorDay}`}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {usage?.lastActiveAt ? formatCycleDate(usage.lastActiveAt) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
