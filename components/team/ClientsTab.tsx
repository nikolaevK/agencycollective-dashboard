"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star, UserPlus } from "lucide-react";
import { CsmClientAssignDialog } from "./CsmClientAssignDialog";
import { cn } from "@/lib/utils";
import { monthlyHeadline } from "@/lib/teamRebill";
import { formatMoney, formatDate } from "@/components/users/format";
import { AvatarInitials } from "@/components/users/AvatarInitials";
import { RebillStatusChip } from "@/components/users/RebillStatusChip";
import { useRosterOptions } from "@/hooks/useRosterOptions";
import {
  CHIP_BASE,
  FALLBACK_CHIP_CLS,
  HEALTH_CHIP_CLS,
  STAGE_CHIP_CLS,
  MANUAL_BILLING_CHIP_CLS,
  PEPADS_BADGE_CLS,
} from "@/components/users/rosterPresentation";
import type { MemberHubPayload, TeamClientSlice } from "./types";

/**
 * The member's attributed clients — live Client Directory data (stage/health
 * chips, team roles, effective MRR, rebill schedule). PepAds rows render their
 * MANUAL billing chips; computed schedule chips are agency-book only (same
 * rule as the Client Directory + rebill alerts).
 */
export function ClientsTab({ hub }: { hub: MemberHubPayload }) {
  const router = useRouter();
  const { labels: healthLabels } = useRosterOptions("health");
  const { labels: stageLabels } = useRosterOptions("stage");
  const [assignOpen, setAssignOpen] = useState(false);
  const clients = hub.clients;
  const totalMrr = clients.reduce((s, c) => s + c.mrrCents, 0);
  const zeroMrr = clients.filter((c) => c.mrrCents === 0).length;
  const canAssign = hub.viewer.privileged && hub.member.attribution === "csm";

  const roleNames = (c: TeamClientSlice, role: string) =>
    c.team.filter((t) => t.role === role).map((t) => t.name).join(", ") || "—";

  return (
    <div className="space-y-3">
      {canAssign && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setAssignOpen(true)}
            className="inline-flex items-center gap-1.5 h-8 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-accent"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Assign clients
          </button>
        </div>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <SummaryTile label="Clients" value={String(clients.length)} />
        <SummaryTile label="Total MRR managed" value={formatMoney(totalMrr)} tone="green" />
        <SummaryTile
          label="Rebilled this month"
          value={formatMoney(monthlyHeadline(hub.summary.monthly).cents)}
          tone="green"
        />
        <SummaryTile
          label="$0-MRR actives"
          value={String(zeroMrr)}
          tone={zeroMrr > 0 ? "amber" : undefined}
        />
        <SummaryTile
          label="Rebills overdue"
          value={String(hub.summary.rebills.overdue)}
          tone={hub.summary.rebills.overdue > 0 ? "red" : undefined}
        />
      </div>

      <div className="rounded-xl border border-border/60 overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left">
              <Th>Client</Th>
              <Th>Stage</Th>
              <Th>Health</Th>
              <Th>Lead</Th>
              <Th>Media Buyer</Th>
              <Th>CSM</Th>
              <Th className="text-right">MRR</Th>
              <Th>Re-bill</Th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr
                key={c.id}
                className="border-b border-border/50 last:border-0 hover:bg-muted/20 cursor-pointer transition-colors"
                onClick={() => router.push(`/dashboard/users/${c.id}`)}
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {c.isTop && (
                      <Star className="h-3.5 w-3.5 shrink-0 text-amber-500 fill-amber-500" />
                    )}
                    <AvatarInitials name={c.displayName} className="w-7 h-7" />
                    <span className="font-bold text-foreground truncate">
                      {c.displayName}
                      {c.book === "pepads" && (
                        <span className={cn(PEPADS_BADGE_CLS, "ml-1.5")}>PepAds</span>
                      )}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <ChipList
                    values={c.stages}
                    clsMap={STAGE_CHIP_CLS}
                    labels={stageLabels}
                  />
                </td>
                <td className="px-3 py-2.5">
                  <ChipList
                    values={c.health}
                    clsMap={HEALTH_CHIP_CLS}
                    labels={healthLabels}
                  />
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {roleNames(c, "lead")}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {roleNames(c, "media_buyer")}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {roleNames(c, "csm")}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 text-right font-bold",
                    c.mrrCents === 0
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-foreground"
                  )}
                >
                  {c.mrrCents === 0 ? "$0 ⚠" : formatMoney(c.mrrCents)}
                </td>
                <td className="px-3 py-2.5">
                  {c.rebill ? (
                    <span className="inline-flex items-center gap-2">
                      <RebillStatusChip status={c.rebill.status} paid={c.rebill.paid} />
                      {c.rebill.nextRebillAt && (
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                          {formatDate(c.rebill.nextRebillAt)}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 flex-wrap">
                      {c.manualBilling.length > 0 ? (
                        c.manualBilling.map((m) => (
                          <span
                            key={m}
                            className={cn(
                              CHIP_BASE,
                              MANUAL_BILLING_CHIP_CLS[m] ?? FALLBACK_CHIP_CLS
                            )}
                          >
                            {m}
                          </span>
                        ))
                      ) : (
                        <span className={cn(CHIP_BASE, FALLBACK_CHIP_CLS)}>manual</span>
                      )}
                      {c.manualNextRebill && (
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                          {formatDate(c.manualNextRebill)}
                        </span>
                      )}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  No clients attributed to this member yet.
                </td>
              </tr>
            )}
          </tbody>
          {clients.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/30">
                <td className="px-3 py-2.5 text-xs font-black uppercase tracking-wide text-muted-foreground">
                  Total · {clients.length} clients
                </td>
                <td colSpan={5} />
                <td className="px-3 py-2.5 text-right font-black text-foreground">
                  {formatMoney(totalMrr)}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {assignOpen && (
        <CsmClientAssignDialog
          member={{ adminId: hub.member.adminId, name: hub.member.name }}
          onClose={() => setAssignOpen(false)}
        />
      )}
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground",
        className
      )}
    >
      {children}
    </th>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "amber" | "red";
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card px-3.5 py-2.5">
      <p
        className={cn(
          "text-lg font-black leading-none",
          tone === "green" && "text-emerald-600 dark:text-emerald-400",
          tone === "amber" && "text-amber-600 dark:text-amber-400",
          tone === "red" && "text-red-600 dark:text-red-400",
          !tone && "text-foreground"
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function ChipList({
  values,
  clsMap,
  labels,
}: {
  values: string[];
  clsMap: Record<string, string>;
  labels: Record<string, string>;
}) {
  if (values.length === 0) return <span className="text-xs text-muted-foreground/50">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {values.map((v) => (
        <span key={v} className={cn(CHIP_BASE, clsMap[v] ?? FALLBACK_CHIP_CLS)}>
          {labels[v] ?? v}
        </span>
      ))}
    </span>
  );
}
