"use client";

import { useState, useMemo, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ExternalLink, Megaphone, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useConfirm } from "@/components/ui/use-confirm";
import { AvatarInitials } from "./AvatarInitials";
import { StatusBadge } from "./StatusBadge";
import { ClientActionsMenu } from "./ClientActionsMenu";
import { useAdmin } from "@/components/providers/AdminProvider";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { RebillStatusChip } from "./RebillStatusChip";
import { ChipMultiSelect } from "./ChipMultiSelect";
import { TeamPicker } from "./TeamPicker";
import { InlineTextCell } from "./InlineTextCell";
import dynamic from "next/dynamic";
// Click-to-open dialogs load on first use, not with the table.
const ManageAccountsModal = dynamic(() => import("./ManageAccountsModal").then((m) => m.ManageAccountsModal), { ssr: false });
const EditClientModal = dynamic(() => import("./EditClientModal").then((m) => m.EditClientModal), { ssr: false });
const MrrDetailModal = dynamic(() => import("./MrrDetailModal").then((m) => m.MrrDetailModal), { ssr: false });
const NewTeamTaskDialog = dynamic(() => import("@/components/team/NewTeamTaskDialog").then((m) => m.NewTeamTaskDialog), { ssr: false });
import {
  STAGE_TONE,
  HEALTH_TONE,
  MANUAL_BILLING_TONE,
  toneOf,
  effectiveMrrCents,
  effectiveLtvCents,
  parseMoneyToCents,
} from "./rosterPresentation";
import { formatMoney, formatDate } from "./format";
import { updateUserAction, deleteUserAction } from "@/app/actions/users";
import {
  useClientProfileMutations,
  type ClientProfilePatch,
} from "@/hooks/useClientProfileMutations";
import { useAdPlatformOptions } from "@/hooks/useAdPlatformOptions";
import { useRosterOptions } from "@/hooks/useRosterOptions";
import {
  MANUAL_BILLING_OPTIONS,
  SERVICE_OPTIONS,
  type ClientTeamMember,
  type TeamRole,
} from "@/lib/clientProfile";
import type { ClientPublic } from "./types";
import type { UserStatus } from "@/lib/users";

const PAGE_SIZE = 20;
const COL_COUNT = 20;

// Clickable numbers (MRR drill, ad-account count): quiet dotted underline.
const LINK_CLS =
  "text-sm font-semibold tabular-nums underline decoration-muted-foreground/40 decoration-dotted underline-offset-4 transition-colors hover:decoration-foreground hover:decoration-solid";

interface ClientDirectoryProps {
  clients: ClientPublic[];
  onRefresh: () => void;
  /**
   * Changes only when the user changes filters/search — used to reset
   * pagination. Must NOT be derived from the data itself: every inline edit
   * optimistically rewrites the clients array, and resetting the page on that
   * would yank the user away from the row they're editing.
   */
  resetKey?: string;
}

export function ClientDirectory({ clients, onRefresh, resetKey }: ClientDirectoryProps) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [managingId, setManagingId] = useState<string | null>(null);
  const [mrrClientId, setMrrClientId] = useState<string | null>(null);
  // External partner admins never open the MRR payout drill — it reads the
  // internal Payout DB (the API would 403 them anyway).
  const { isExternal } = useAdmin();
  // Workspace labels for the badge on partner-book rows (multi-book viewers).
  const { workspaces: workspaceOptions } = useWorkspaces();
  const workspaceLabel = (slug: string) =>
    workspaceOptions.find((w) => w.value === slug)?.label ?? slug;
  const showWorkspaceBadges = workspaceOptions.length > 1;
  const [taskClientId, setTaskClientId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { confirm, dialog } = useConfirm();
  const { patchProfile, putTeam } = useClientProfileMutations();
  const { options: platformOptions, addOption: addPlatformOption } =
    useAdPlatformOptions();
  const { options: stageOptions, addOption: addStageOption } =
    useRosterOptions("stage");
  const { options: healthOptions, addOption: addHealthOption } =
    useRosterOptions("health");

  // Reset to page 1 when the FILTERS change, so applying a filter doesn't
  // strand the user on a now-out-of-range page. (Keyed on the filters, not the
  // list — see resetKey.)
  useEffect(() => setPage(1), [resetKey]);

  const editingClient = editingId ? clients.find((c) => c.id === editingId) ?? null : null;
  const taskClient = taskClientId ? clients.find((c) => c.id === taskClientId) ?? null : null;
  const managingClient = managingId ? clients.find((c) => c.id === managingId) ?? null : null;
  const mrrClient = mrrClientId ? clients.find((c) => c.id === mrrClientId) ?? null : null;

  // Two-book layout (mirrors the roster prototype): each book keeps its own
  // pinned ★ Top Clients group above its own list — Agency Collective first
  // (paginated), then the PepAds book grouped at the bottom (small by nature —
  // not paginated).
  const topAgency = useMemo(
    () => clients.filter((c) => c.profile.isTop && c.profile.book !== "pepads"),
    [clients]
  );
  const topPepads = useMemo(
    () => clients.filter((c) => c.profile.isTop && c.profile.book === "pepads"),
    [clients]
  );
  const agencyClients = useMemo(
    () => clients.filter((c) => !c.profile.isTop && c.profile.book !== "pepads"),
    [clients]
  );
  const pepadsClients = useMemo(
    () => clients.filter((c) => !c.profile.isTop && c.profile.book === "pepads"),
    [clients]
  );
  const pepadsTotal = topPepads.length + pepadsClients.length;

  const totalPages = Math.max(1, Math.ceil(agencyClients.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = useMemo(
    () => agencyClients.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [agencyClients, currentPage]
  );

  // Errors are surfaced by the hook itself (rollback + alert) — per-call
  // callbacks would be skipped if the row unmounts while the request flies.
  function patch(client: ClientPublic, changes: ClientProfilePatch) {
    patchProfile.mutate({ userId: client.id, changes });
  }

  /** Money cells: empty clears, unparseable input is ignored (never clears). */
  function patchMoney(
    client: ClientPublic,
    field: "manualMrrCents" | "manualLtvCents",
    raw: string | null
  ) {
    const cents = parseMoneyToCents(raw);
    if (raw !== null && cents === null) {
      alert(`"${raw}" isn't a valid amount — use e.g. 7000, $7,000 or 7k.`);
      return;
    }
    patch(client, { [field]: cents } as ClientProfilePatch);
  }

  function saveTeam(client: ClientPublic, role: TeamRole, members: ClientTeamMember[]) {
    putTeam.mutate({ userId: client.id, role, members });
  }

  function handleArchive(client: ClientPublic) {
    const newStatus: UserStatus = client.status === "archived" ? "active" : "archived";
    const formData = new FormData();
    formData.set("id", client.id);
    formData.set("status", newStatus);
    startTransition(async () => {
      const res = await updateUserAction(formData);
      if (res?.error) {
        alert(res.error);
        return;
      }
      onRefresh();
    });
  }

  async function handleDelete(client: ClientPublic) {
    if (
      !(await confirm({
        title: `Delete "${client.displayName}"?`,
        description: "This cannot be undone.",
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    startTransition(async () => {
      const res = await deleteUserAction(client.id);
      if (res?.error) {
        alert(res.error);
        return;
      }
      onRefresh();
    });
  }

  function renderRow(client: ClientPublic) {
    const profile = client.profile;
    const isPepads = profile.book === "pepads";
    const leads = client.team.filter((m) => m.role === "lead");
    const buyers = client.team.filter((m) => m.role === "media_buyer");
    const csms = client.team.filter((m) => m.role === "csm");
    const perfDerived = profile.perfFee ? null : client.derivedPerfFee;

    return (
      <TableRow
        key={client.id}
        className={cn(!profile.adsRunning && "bg-muted/20")}
      >
        {/* Client (sticky) — star + avatar + name + website + book badge */}
        <Td className="sticky left-0 z-10 border-r bg-card px-3">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={(e) => {
                e.stopPropagation();
                patch(client, { isTop: !profile.isTop });
              }}
              className="shrink-0"
              title={profile.isTop ? "Unpin from Top Clients" : "Mark as top client"}
              aria-label="Toggle top client"
            >
              <Star
                className={cn(
                  "size-4 transition-colors",
                  profile.isTop
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground/40 hover:text-foreground"
                )}
              />
            </Button>
            <div
              className="group/client flex cursor-pointer items-center gap-3 min-w-0"
              onClick={() => router.push(`/dashboard/users/${client.id}`)}
            >
              <AvatarInitials name={client.displayName} />
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={cn(
                      "truncate text-sm font-medium underline-offset-4 group-hover/client:underline",
                      profile.adsRunning ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {client.displayName}
                  </span>
                  {isPepads && (
                    <Badge variant="outline" tone="warning" className="shrink-0">
                      PepAds
                    </Badge>
                  )}
                  {showWorkspaceBadges && client.workspace !== "main" && (
                    <Badge variant="secondary" className="shrink-0">
                      {workspaceLabel(client.workspace)}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {client.category || client.email || "—"}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <InlineTextCell
                    value={profile.website}
                    placeholder="+ website"
                    onSave={(v) => patch(client, { website: v })}
                    className="text-muted-foreground max-w-[150px] truncate"
                  />
                  {profile.website && (
                    <a
                      href={
                        /^https?:\/\//i.test(profile.website)
                          ? profile.website
                          : `https://${profile.website}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                      title="Open website"
                    >
                      <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Td>
        <Td>
          <StatusBadge status={client.status} />
        </Td>
        {/* Stage */}
        <Td className="min-w-[170px]">
          <ChipMultiSelect
            value={profile.stages}
            options={stageOptions}
            toneOf={(v) => toneOf(STAGE_TONE, v)}
            onChange={(stages) => patch(client, { stages })}
            onCreateOption={addStageOption}
            addLabel="Add stage"
          />
        </Td>
        {/* Client Health */}
        <Td className="min-w-[170px]">
          <ChipMultiSelect
            value={profile.health}
            options={healthOptions}
            toneOf={(v) => toneOf(HEALTH_TONE, v)}
            onChange={(health) => patch(client, { health })}
            onCreateOption={addHealthOption}
            addLabel="Add health"
          />
        </Td>
        {/* Ads: Meta + TikTok running switches + platforms */}
        <Td className="min-w-[180px]">
          <div className="space-y-1.5">
            <RunningSwitch
              label="Meta"
              running={profile.adsRunning}
              onToggle={() => patch(client, { adsRunning: !profile.adsRunning })}
            />
            <RunningSwitch
              label="TikTok"
              running={profile.tiktokAdsRunning}
              onToggle={() =>
                patch(client, { tiktokAdsRunning: !profile.tiktokAdsRunning })
              }
            />
            <ChipMultiSelect
              value={profile.adPlatforms}
              options={platformOptions}
              onChange={(adPlatforms) => patch(client, { adPlatforms })}
              onCreateOption={addPlatformOption}
              addLabel="Add platform"
              compact
            />
          </div>
        </Td>
        {/* Lead — Head of Ads */}
        <Td className="min-w-[140px]">
          <TeamPicker
            role="lead"
            members={leads}
            onChange={(members) => saveTeam(client, "lead", members)}
          />
        </Td>
        {/* Media Buyer */}
        <Td className="min-w-[140px]">
          <TeamPicker
            role="media_buyer"
            members={buyers}
            onChange={(members) => saveTeam(client, "media_buyer", members)}
          />
        </Td>
        {/* CSM — Client Success Manager (own role, never merged with MB) */}
        <Td className="min-w-[140px]">
          <TeamPicker
            role="csm"
            members={csms}
            onChange={(members) => saveTeam(client, "csm", members)}
          />
        </Td>
        {/* Services */}
        <Td className="min-w-[200px]">
          <ChipMultiSelect
            value={profile.services}
            options={SERVICE_OPTIONS}
            onChange={(services) => patch(client, { services })}
            addLabel="Add service"
          />
        </Td>
        {/* Perf Fee (manual wins; derived from ad_accounts shown as auto) */}
        <Td className="min-w-[90px]">
          <InlineTextCell
            value={profile.perfFee}
            placeholder="—"
            emptyDisplay={
              perfDerived ? (
                <span className="text-muted-foreground" title="Derived from linked ad accounts">
                  {perfDerived}
                  <span className="ml-1 text-[10px] text-muted-foreground/70">auto</span>
                </span>
              ) : undefined
            }
            onSave={(v) => patch(client, { perfFee: v })}
          />
        </Td>
        {/* Rev / Threshold */}
        <Td className="min-w-[100px]">
          <InlineTextCell
            value={profile.revThreshold}
            placeholder="—"
            onSave={(v) => patch(client, { revThreshold: v })}
          />
        </Td>
        <Td>
          <span className="text-sm text-foreground whitespace-nowrap">
            {formatDate(client.joinedAt)}
          </span>
        </Td>
        {/* Monthly MRR — computed for agency; inline-editable for PepAds */}
        <Td className="text-right">
          {isPepads ? (
            <InlineTextCell
              value={
                profile.manualMrrCents != null ? formatMoney(profile.manualMrrCents) : null
              }
              placeholder="—"
              emptyDisplay={
                effectiveMrrCents(client) > 0 ? (
                  <span className="text-muted-foreground" title="No manual MRR set — payout/legacy fallback">
                    {formatMoney(effectiveMrrCents(client))}
                  </span>
                ) : undefined
              }
              onSave={(v) => patchMoney(client, "manualMrrCents", v)}
              className="font-semibold tabular-nums"
            />
          ) : client.payoutMrr > 0 && !isExternal ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMrrClientId(client.id);
              }}
              className={LINK_CLS}
            >
              {formatMoney(client.payoutMrr)}
            </button>
          ) : (
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {formatMoney(client.payoutMrr)}
            </span>
          )}
        </Td>
        {/* LTV — all-time payout revenue; inline-editable for PepAds */}
        <Td className="text-right">
          {isPepads ? (
            <InlineTextCell
              value={
                profile.manualLtvCents != null ? formatMoney(profile.manualLtvCents) : null
              }
              placeholder="—"
              emptyDisplay={
                client.totalRevenue > 0 ? (
                  <span className="text-muted-foreground" title="No manual LTV set — payout total fallback">
                    {formatMoney(client.totalRevenue)}
                  </span>
                ) : undefined
              }
              onSave={(v) => patchMoney(client, "manualLtvCents", v)}
              className="tabular-nums"
            />
          ) : (
            <span className="text-sm font-medium tabular-nums text-foreground">
              {formatMoney(client.totalRevenue)}
            </span>
          )}
        </Td>
        <Td>
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {formatDate(client.schedule.lastRebilledAt)}
          </span>
        </Td>
        {/* Next Re-bill: computed for agency, manual for pepads */}
        <Td className="min-w-[190px]">
          {isPepads ? (
            <div className="space-y-1.5">
              <ChipMultiSelect
                value={profile.manualBilling}
                options={MANUAL_BILLING_OPTIONS}
                toneOf={(v) => toneOf(MANUAL_BILLING_TONE, v)}
                onChange={(manualBilling) =>
                  patch(client, {
                    manualBilling: manualBilling as ClientProfilePatch["manualBilling"],
                  })
                }
                addLabel="Set billing status"
                compact
              />
              <InlineTextCell
                value={profile.manualNextRebill}
                type="date"
                placeholder="+ set date"
                onSave={(v) => patch(client, { manualNextRebill: v })}
                className="text-muted-foreground"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <RebillStatusChip status={client.schedule.status} paid={client.schedule.paid} />
              {client.schedule.nextRebillAt && (
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDate(client.schedule.nextRebillAt)}
                </span>
              )}
            </div>
          )}
        </Td>
        <Td className="text-center">
          <span className="text-sm font-medium tabular-nums text-foreground">{client.accounts.length}</span>
        </Td>
        {/* Ad Accounts (purchased ad_accounts) — opens the client's Ad Accounts tab */}
        <Td className="text-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/dashboard/users/${client.id}?tab=adAccounts`);
            }}
            className={cn(
              LINK_CLS,
              "font-medium",
              client.adAccountCount > 0 ? "text-foreground" : "text-muted-foreground"
            )}
            title="Open Ad Accounts tab"
          >
            {client.adAccountCount}
          </button>
        </Td>
        {/* Quick notes */}
        <Td className="min-w-[200px] max-w-[260px]">
          <InlineTextCell
            value={profile.rosterNotes}
            placeholder="Add notes…"
            multiline
            onSave={(v) => patch(client, { rosterNotes: v })}
            className="text-muted-foreground"
          />
        </Td>
        <Td className="text-right">
          <ClientActionsMenu
            client={client}
            onEdit={() => setEditingId(client.id)}
            onManageAccounts={() => setManagingId(client.id)}
            onNewTask={() => setTaskClientId(client.id)}
            onArchive={() => handleArchive(client)}
            onDelete={() => handleDelete(client)}
          />
        </Td>
      </TableRow>
    );
  }

  // Section header row; `separate` marks the start of the PepAds book.
  function renderGroupLabel(label: React.ReactNode, separate?: boolean) {
    return (
      <TableRow className={cn("bg-muted/40 hover:bg-muted/40", separate && "border-t-2")}>
        <TableCell colSpan={COL_COUNT} className="px-4 py-2">
          <div className="sticky left-4 w-fit">{label}</div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <Card>
      {/* Desktop Table */}
      <div className="hidden md:block">
        <Table className="min-w-[2250px] text-left">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <Th className="pl-4 sticky left-0 z-20 bg-card border-r min-w-[260px]">
                Client
              </Th>
              <Th>Status</Th>
              <Th>Stage</Th>
              <Th>Client Health</Th>
              <Th>Ads</Th>
              <Th>Head of Ads</Th>
              <Th>Media Buyer</Th>
              <Th>CSM</Th>
              <Th>Services</Th>
              <Th>Perf Fee</Th>
              <Th>Rev / Threshold</Th>
              <Th>Date Joined</Th>
              <Th className="text-right">Monthly MRR</Th>
              <Th className="text-right">LTV</Th>
              <Th>Last Re-bill</Th>
              <Th>Next Re-bill</Th>
              <Th className="text-center">Accounts</Th>
              <Th className="text-center">Ad Accounts</Th>
              <Th>Notes</Th>
              <Th className="text-right pr-4">Actions</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={COL_COUNT}
                  className="px-4 py-12 text-center text-sm text-muted-foreground"
                >
                  No clients match your filters.
                </TableCell>
              </TableRow>
            ) : (
              <>
                {topAgency.length > 0 && (
                  <>
                    {renderGroupLabel(
                      <SectionLabel
                        star
                        label="Top Clients · Agency Collective"
                        count={topAgency.length}
                      />
                    )}
                    {topAgency.map(renderRow)}
                  </>
                )}
                {(topAgency.length > 0 || pepadsTotal > 0) &&
                  renderGroupLabel(
                    <SectionLabel label="Agency Collective" count={agencyClients.length} />
                  )}
                {paginated.map(renderRow)}
                {pepadsTotal > 0 && (
                  <>
                    {renderGroupLabel(
                      <SectionLabel
                        megaphone
                        label="PepAds"
                        count={pepadsTotal}
                        hint="Separate book — statuses managed manually"
                      />,
                      true
                    )}
                    {topPepads.length > 0 && (
                      <>
                        {renderGroupLabel(
                          <SectionLabel
                            star
                            label="Top Clients · PepAds"
                            count={topPepads.length}
                          />
                        )}
                        {topPepads.map(renderRow)}
                        {pepadsClients.length > 0 &&
                          renderGroupLabel(
                            <SectionLabel label="All PepAds" count={pepadsClients.length} />
                          )}
                      </>
                    )}
                    {pepadsClients.map(renderRow)}
                  </>
                )}
              </>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden p-3 space-y-3">
        {clients.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No clients match your filters.
          </p>
        ) : (
          [
            ...topAgency.map((c) => ({ c, section: "top" as const })),
            ...paginated.map((c) => ({ c, section: "agency" as const })),
            ...topPepads.map((c) => ({ c, section: "top-pepads" as const })),
            ...pepadsClients.map((c) => ({ c, section: "pepads" as const })),
          ].map(({ c: client, section }, i, arr) => {
            const firstOfSection = i === 0 || arr[i - 1].section !== section;
            const profile = client.profile;
            const isPepads = profile.book === "pepads";
            const leads = client.team.filter((m) => m.role === "lead");
            const buyers = client.team.filter((m) => m.role === "media_buyer");
            const csms = client.team.filter((m) => m.role === "csm");
            return (
              <div key={client.id}>
                {firstOfSection && (
                  <div
                    className={cn(
                      "px-1 pb-2",
                      (section === "top-pepads" ||
                        (section === "pepads" && topPepads.length === 0)) &&
                        "mt-1 border-t-2 pt-3"
                    )}
                  >
                    {section === "top" && (
                      <SectionLabel
                        star
                        label="Top Clients · Agency Collective"
                        count={topAgency.length}
                      />
                    )}
                    {section === "agency" && (
                      <SectionLabel label="Agency Collective" count={agencyClients.length} />
                    )}
                    {section === "top-pepads" && (
                      <SectionLabel
                        megaphone
                        star
                        label="Top Clients · PepAds"
                        count={topPepads.length}
                      />
                    )}
                    {section === "pepads" &&
                      (topPepads.length > 0 ? (
                        <SectionLabel label="All PepAds" count={pepadsClients.length} />
                      ) : (
                        <SectionLabel
                          megaphone
                          label="PepAds"
                          count={pepadsClients.length}
                          hint="Separate book"
                        />
                      ))}
                  </div>
                )}
              <div className="rounded-2xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div
                    className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer active:scale-[0.98] transition-all"
                    onClick={() => router.push(`/dashboard/users/${client.id}`)}
                  >
                    <AvatarInitials name={client.displayName} className="w-11 h-11" />
                    <div className="min-w-0 space-y-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-foreground">
                          {client.displayName}
                        </span>
                        {isPepads && (
                          <Badge variant="outline" tone="warning" className="shrink-0">
                            PepAds
                          </Badge>
                        )}
                        {showWorkspaceBadges && client.workspace !== "main" && (
                          <Badge variant="secondary" className="shrink-0">
                            {workspaceLabel(client.workspace)}
                          </Badge>
                        )}
                      </div>
                      <StatusBadge status={client.status} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => patch(client, { isTop: !profile.isTop })}
                      aria-label="Toggle top client"
                    >
                      <Star
                        className={cn(
                          "size-4",
                          profile.isTop
                            ? "fill-amber-400 text-amber-400"
                            : "text-muted-foreground/40"
                        )}
                      />
                    </Button>
                    <ClientActionsMenu
                      client={client}
                      onEdit={() => setEditingId(client.id)}
                      onManageAccounts={() => setManagingId(client.id)}
                      onNewTask={() => setTaskClientId(client.id)}
                      onArchive={() => handleArchive(client)}
                      onDelete={() => handleDelete(client)}
                    />
                  </div>
                </div>
                {/* Always rendered — the editors carry the "+" button, so an
                    empty client must still show them to allow adding. */}
                <div className="mt-3 flex flex-wrap gap-1">
                  <ChipMultiSelect
                    value={profile.stages}
                    options={stageOptions}
                    toneOf={(v) => toneOf(STAGE_TONE, v)}
                    onChange={(stages) => patch(client, { stages })}
                    onCreateOption={addStageOption}
                    compact
                  />
                  <ChipMultiSelect
                    value={profile.health}
                    options={healthOptions}
                    toneOf={(v) => toneOf(HEALTH_TONE, v)}
                    onChange={(health) => patch(client, { health })}
                    onCreateOption={addHealthOption}
                    compact
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                  <RunningSwitch
                    label="Meta"
                    running={profile.adsRunning}
                    onToggle={() => patch(client, { adsRunning: !profile.adsRunning })}
                  />
                  <RunningSwitch
                    label="TikTok"
                    running={profile.tiktokAdsRunning}
                    onToggle={() =>
                      patch(client, { tiktokAdsRunning: !profile.tiktokAdsRunning })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                  <Field label="Joined" value={formatDate(client.joinedAt)} />
                  <Field
                    label="Monthly MRR"
                    value={formatMoney(effectiveMrrCents(client))}
                    onClick={
                      !isPepads && client.payoutMrr > 0 && !isExternal
                        ? () => setMrrClientId(client.id)
                        : undefined
                    }
                  />
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Head of Ads
                    </p>
                    <div className="mt-1">
                      <TeamPicker
                        role="lead"
                        members={leads}
                        onChange={(members) => saveTeam(client, "lead", members)}
                        compact
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Media Buyer
                    </p>
                    <div className="mt-1">
                      <TeamPicker
                        role="media_buyer"
                        members={buyers}
                        onChange={(members) => saveTeam(client, "media_buyer", members)}
                        compact
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      CSM
                    </p>
                    <div className="mt-1">
                      <TeamPicker
                        role="csm"
                        members={csms}
                        onChange={(members) => saveTeam(client, "csm", members)}
                        compact
                      />
                    </div>
                  </div>
                  <Field
                    label="Last re-bill"
                    value={formatDate(client.schedule.lastRebilledAt)}
                  />
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Next re-bill
                    </p>
                    <div className="mt-1 flex flex-col gap-1">
                      {isPepads ? (
                        <>
                          <ChipMultiSelect
                            value={profile.manualBilling}
                            options={MANUAL_BILLING_OPTIONS}
                            toneOf={(v) => toneOf(MANUAL_BILLING_TONE, v)}
                            onChange={(manualBilling) =>
                              patch(client, {
                                manualBilling:
                                  manualBilling as ClientProfilePatch["manualBilling"],
                              })
                            }
                            compact
                          />
                          <InlineTextCell
                            value={profile.manualNextRebill}
                            type="date"
                            placeholder="+ set date"
                            onSave={(v) => patch(client, { manualNextRebill: v })}
                            className="text-muted-foreground"
                          />
                        </>
                      ) : (
                        <RebillStatusChip
                          status={client.schedule.status}
                          paid={client.schedule.paid}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t">
          <p className="text-xs text-muted-foreground">
            Showing {paginated.length} of {agencyClients.length} Agency Collective
            {topAgency.length > 0 && ` · ${topAgency.length} top pinned`}
            {pepadsTotal > 0 && ` · ${pepadsTotal} PepAds below`}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              aria-label="Previous page"
            >
              <ChevronLeft />
            </Button>
            {(() => {
              const maxButtons = 5;
              const half = Math.floor(maxButtons / 2);
              let start = Math.max(1, currentPage - half);
              const end = Math.min(totalPages, start + maxButtons - 1);
              if (end - start + 1 < maxButtons) start = Math.max(1, end - maxButtons + 1);
              return Array.from({ length: end - start + 1 }, (_, i) => {
                const pageNum = start + i;
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? "default" : "ghost"}
                    size="icon-sm"
                    onClick={() => setPage(pageNum)}
                    aria-current={currentPage === pageNum ? "page" : undefined}
                    className="tabular-nums"
                  >
                    {pageNum}
                  </Button>
                );
              });
            })()}
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              aria-label="Next page"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}

      {/* Modals */}
      {editingClient && (
        <EditClientModal
          client={editingClient}
          onClose={() => setEditingId(null)}
          onUpdated={onRefresh}
        />
      )}
      {managingClient && (
        <ManageAccountsModal
          client={managingClient}
          onClose={() => setManagingId(null)}
          onUpdated={onRefresh}
        />
      )}
      {mrrClient && (
        <MrrDetailModal
          open={!!mrrClient}
          onClose={() => setMrrClientId(null)}
          clientName={mrrClient.displayName}
          mrrCents={mrrClient.payoutMrr}
        />
      )}
      {taskClient && (
        <NewTeamTaskDialog client={taskClient} onClose={() => setTaskClientId(null)} />
      )}
      {dialog}
    </Card>
  );
}

function RunningSwitch({
  label,
  running,
  onToggle,
}: {
  label: string;
  running: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className="inline-flex cursor-pointer items-center gap-1.5"
      onClick={(e) => e.stopPropagation()}
      title={
        running
          ? `${label} ads running — click to pause`
          : `${label} ads paused — click to resume`
      }
    >
      <span className="w-11 text-left text-xs text-muted-foreground">{label}</span>
      <Switch
        size="sm"
        checked={running}
        onCheckedChange={() => onToggle()}
        aria-label={`${label} ads`}
      />
      <span
        className={cn(
          "text-xs font-medium",
          running ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"
        )}
      >
        {running ? "Running" : "Paused"}
      </span>
    </label>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <TableHead className={cn("px-4 text-muted-foreground", className)}>
      {children}
    </TableHead>
  );
}

/** Body cell with the directory's padding; content may wrap (chips, notes). */
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <TableCell className={cn("px-4 py-3 whitespace-normal", className)}>{children}</TableCell>;
}

/** Section header text: optional star / megaphone, label, count badge, hint. */
function SectionLabel({
  label,
  count,
  hint,
  star,
  megaphone,
}: {
  label: string;
  count: number;
  hint?: string;
  star?: boolean;
  megaphone?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
      {megaphone && <Megaphone className="size-4 text-muted-foreground" />}
      {star && <Star className="size-3.5 fill-amber-400 text-amber-400" />}
      <span>{label}</span>
      <Badge variant="secondary" className="tabular-nums">
        {count}
      </Badge>
      {hint && <span className="text-xs font-normal text-muted-foreground">· {hint}</span>}
    </div>
  );
}

function Field({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick?: () => void;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      {onClick ? (
        <button onClick={onClick} className={cn(LINK_CLS, "mt-0.5")}>
          {value}
        </button>
      ) : (
        <p className="text-sm font-medium tabular-nums text-foreground mt-0.5">{value}</p>
      )}
    </div>
  );
}
