"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Star, UserPlus } from "lucide-react";
import { CsmClientAssignDialog } from "./CsmClientAssignDialog";
import { cn } from "@/lib/utils";
import { monthlyHeadline } from "@/lib/teamRebill";
import { formatMoney, formatDate } from "@/components/users/format";
import { AvatarInitials } from "@/components/users/AvatarInitials";
import { RebillStatusChip } from "@/components/users/RebillStatusChip";
import { useRosterOptions } from "@/hooks/useRosterOptions";
import { useAdmin } from "@/components/providers/AdminProvider";
import { Badge, StatusBadge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  HEALTH_TONE,
  MANUAL_BILLING_TONE,
  STAGE_TONE,
  toneOf,
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
  // Client rows link into the Client Directory — only for viewers who hold its
  // `users` permission (a media buyer without it would land on Access Denied).
  const admin = useAdmin();
  const canOpenClient = admin.isSuper || admin.permissions.users;
  const openClient = (id: string) => router.push(`/dashboard/users/${id}`);

  const roleNames = (c: TeamClientSlice, role: string) =>
    c.team.filter((t) => t.role === role).map((t) => t.name).join(", ") || "—";

  return (
    <div className="space-y-3">
      {canAssign && (
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={() => setAssignOpen(true)}>
            <UserPlus />
            Assign clients
          </Button>
        </div>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryTile label="Clients" value={String(clients.length)} />
        <SummaryTile label="Total MRR managed" value={formatMoney(totalMrr)} />
        <SummaryTile
          label="Rebilled this month"
          value={formatMoney(monthlyHeadline(hub.summary.monthly).cents)}
        />
        <SummaryTile
          label="$0-MRR actives"
          value={String(zeroMrr)}
          tone={zeroMrr > 0 ? "warning" : undefined}
        />
        <SummaryTile
          label="Rebills overdue"
          value={String(hub.summary.rebills.overdue)}
          tone={hub.summary.rebills.overdue > 0 ? "danger" : undefined}
        />
      </div>

      {/* Card list below lg — the 860px table needs 2+ screen-widths of
          panning on phones, and the sidebar leaves only ~464px at md. */}
      <div className="space-y-2.5 lg:hidden">
        {clients.length === 0 ? (
          <Card className="px-3 py-10 text-center text-muted-foreground">
            No clients attributed to this member yet.
          </Card>
        ) : (
          <>
            {clients.map((c) => (
              <ClientCardShell
                key={c.id}
                onClick={canOpenClient ? () => openClient(c.id) : undefined}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {c.isTop && (
                      <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />
                    )}
                    <AvatarInitials name={c.displayName} className="h-7 w-7 text-xs" />
                    <ClientName c={c} />
                  </div>
                  <MrrValue cents={c.mrrCents} className="shrink-0 text-sm" />
                </div>
                <div className="mt-2">
                  <RebillCell c={c} />
                </div>
              </ClientCardShell>
            ))}
            <div className="flex items-center justify-between rounded-2xl bg-muted/40 px-3 py-2.5">
              <span className="text-xs font-medium text-muted-foreground">
                Total · {clients.length} clients
              </span>
              <span className="font-semibold tabular-nums text-foreground">
                {formatMoney(totalMrr)}
              </span>
            </div>
          </>
        )}
      </div>

      <Card className="hidden lg:block">
        <Table className="min-w-[860px] text-left">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <Th>Client</Th>
              <Th>Stage</Th>
              <Th>Health</Th>
              <Th>Lead</Th>
              <Th>Media Buyer</Th>
              <Th>CSM</Th>
              <Th className="text-right">MRR</Th>
              <Th>Re-bill</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((c) => (
              <TableRow
                key={c.id}
                className={cn(canOpenClient ? "cursor-pointer" : "hover:bg-transparent")}
                onClick={canOpenClient ? () => openClient(c.id) : undefined}
              >
                <Td>
                  <div className="flex min-w-0 items-center gap-2.5">
                    {c.isTop && (
                      <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />
                    )}
                    <AvatarInitials name={c.displayName} className="h-7 w-7 text-xs" />
                    <ClientName c={c} />
                  </div>
                </Td>
                <Td>
                  <ChipList values={c.stages} toneMap={STAGE_TONE} labels={stageLabels} />
                </Td>
                <Td>
                  <ChipList values={c.health} toneMap={HEALTH_TONE} labels={healthLabels} />
                </Td>
                <Td className="text-xs text-muted-foreground">{roleNames(c, "lead")}</Td>
                <Td className="text-xs text-muted-foreground">{roleNames(c, "media_buyer")}</Td>
                <Td className="text-xs text-muted-foreground">{roleNames(c, "csm")}</Td>
                <Td className="text-right">
                  <MrrValue cents={c.mrrCents} />
                </Td>
                <Td>
                  <RebillCell c={c} />
                </Td>
              </TableRow>
            ))}
            {clients.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={8}
                  className="px-4 py-10 text-center text-sm text-muted-foreground"
                >
                  No clients attributed to this member yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          {clients.length > 0 && (
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <Td className="text-xs font-medium text-muted-foreground">
                  Total · {clients.length} clients
                </Td>
                <td colSpan={5} />
                <Td className="text-right font-semibold tabular-nums text-foreground">
                  {formatMoney(totalMrr)}
                </Td>
                <td />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </Card>

      {assignOpen && (
        <CsmClientAssignDialog
          member={{
            adminId: hub.member.adminId,
            name: hub.member.name,
            workspaces: hub.memberWorkspaces,
          }}
          onClose={() => setAssignOpen(false)}
        />
      )}
    </div>
  );
}

/** Mobile client card — a link-button only when the viewer may open the client. */
function ClientCardShell({
  onClick,
  children,
}: {
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const cls =
    "block w-full rounded-3xl bg-card p-3 text-left text-sm shadow-sm ring-1 ring-foreground/5 dark:ring-foreground/10";
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={cn(cls, "transition-colors hover:bg-muted/40")}
    >
      {children}
    </button>
  ) : (
    <div className={cls}>{children}</div>
  );
}

/** Client name + the PepAds book badge (Client Directory rendering). */
function ClientName({ c }: { c: TeamClientSlice }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate text-sm font-medium text-foreground">{c.displayName}</span>
      {c.book === "pepads" && (
        <Badge variant="outline" tone="warning" className="shrink-0">
          PepAds
        </Badge>
      )}
    </span>
  );
}

/** MRR figure — a $0 MRR is the one value that needs attention (warning). */
function MrrValue({ cents, className }: { cents: number; className?: string }) {
  return cents === 0 ? (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium tabular-nums text-amber-700 dark:text-amber-400",
        className
      )}
    >
      <AlertTriangle className="size-3.5" />
      $0
    </span>
  ) : (
    <span className={cn("font-medium tabular-nums text-foreground", className)}>
      {formatMoney(cents)}
    </span>
  );
}

/** Re-bill chip(s) + next-bill date — shared by the table cell and mobile card. */
function RebillCell({ c }: { c: TeamClientSlice }) {
  return c.rebill ? (
    // Wraps the date under the chips when the column is tight (laptop widths).
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <RebillStatusChip status={c.rebill.status} paid={c.rebill.paid} />
      {c.rebill.nextRebillAt && (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {formatDate(c.rebill.nextRebillAt)}
        </span>
      )}
    </span>
  ) : (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {c.manualBilling.length > 0 ? (
        c.manualBilling.map((m) => (
          <StatusBadge key={m} tone={toneOf(MANUAL_BILLING_TONE, m)}>
            {m}
          </StatusBadge>
        ))
      ) : (
        <Badge variant="outline" className="font-normal text-muted-foreground">
          manual
        </Badge>
      )}
      {c.manualNextRebill && (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {formatDate(c.manualNextRebill)}
        </span>
      )}
    </span>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <TableHead className={cn("px-4 text-muted-foreground", className)}>{children}</TableHead>
  );
}

/** Body cell with the directory's padding; content may wrap (chips). */
function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <TableCell className={cn("whitespace-normal px-4 py-3", className)}>{children}</TableCell>;
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  /** Only for counts that need attention when non-zero. */
  tone?: Extract<BadgeTone, "warning" | "danger">;
}) {
  return (
    <div className="rounded-3xl bg-card px-4 py-3 shadow-sm ring-1 ring-foreground/5 dark:ring-foreground/10">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          tone === "warning" && "text-amber-700 dark:text-amber-400",
          tone === "danger" && "text-red-700 dark:text-red-400",
          !tone && "text-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ChipList({
  values,
  toneMap,
  labels,
}: {
  values: string[];
  toneMap: Record<string, BadgeTone>;
  labels: Record<string, string>;
}) {
  if (values.length === 0) return <span className="text-xs text-muted-foreground/50">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {values.map((v) => (
        <StatusBadge key={v} tone={toneOf(toneMap, v)}>
          {labels[v] ?? v}
        </StatusBadge>
      ))}
    </span>
  );
}
