"use client";

import { useState, useMemo, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { AvatarInitials } from "./AvatarInitials";
import { StatusBadge } from "./StatusBadge";
import { ClientActionsMenu } from "./ClientActionsMenu";
import { ManageAccountsModal } from "./ManageAccountsModal";
import { EditClientModal } from "./EditClientModal";
import { MrrDetailModal } from "./MrrDetailModal";
import { RebillStatusChip } from "./RebillStatusChip";
import { ChipMultiSelect } from "./ChipMultiSelect";
import { TeamPicker } from "./TeamPicker";
import { InlineTextCell } from "./InlineTextCell";
import {
  STAGE_CHIP_CLS,
  HEALTH_CHIP_CLS,
  PLATFORM_CHIP_CLS,
  MANUAL_BILLING_CHIP_CLS,
  SERVICE_CHIP_CLS,
  PEPADS_BADGE_CLS,
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
import {
  STAGE_OPTIONS,
  HEALTH_OPTIONS,
  MANUAL_BILLING_OPTIONS,
  SERVICE_OPTIONS,
  type ClientTeamMember,
  type TeamRole,
} from "@/lib/clientProfile";
import type { ClientPublic } from "./types";
import type { UserStatus } from "@/lib/users";

const PAGE_SIZE = 20;
const COL_COUNT = 18;

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
  const [, startTransition] = useTransition();
  const { patchProfile, putTeam } = useClientProfileMutations();
  const { options: platformOptions, addOption: addPlatformOption } =
    useAdPlatformOptions();

  // Reset to page 1 when the FILTERS change, so applying a filter doesn't
  // strand the user on a now-out-of-range page. (Keyed on the filters, not the
  // list — see resetKey.)
  useEffect(() => setPage(1), [resetKey]);

  const editingClient = editingId ? clients.find((c) => c.id === editingId) ?? null : null;
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

  function handleDelete(client: ClientPublic) {
    if (!confirm(`Delete "${client.displayName}"? This cannot be undone.`)) return;
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
    const perfDerived = profile.perfFee ? null : client.derivedPerfFee;

    return (
      <tr
        key={client.id}
        className={cn(
          "border-b border-border/50 dark:border-white/[0.06] hover:bg-muted/20 transition-colors",
          profile.isTop && "bg-amber-500/[0.05]",
          !profile.adsRunning && "bg-muted/10"
        )}
      >
        {/* Client (sticky) — star + avatar + name + website + book badge */}
        <td className="px-3 py-3 sticky left-0 z-10 bg-card border-r border-border/40">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                patch(client, { isTop: !profile.isTop });
              }}
              className="shrink-0 p-0.5"
              title={profile.isTop ? "Unpin from Top Clients" : "Mark as top client"}
              aria-label="Toggle top client"
            >
              <Star
                className={cn(
                  "h-4 w-4 transition-colors",
                  profile.isTop
                    ? "text-amber-500 fill-amber-500"
                    : "text-muted-foreground/40 hover:text-amber-500"
                )}
              />
            </button>
            <div
              className="flex items-center gap-3 cursor-pointer min-w-0"
              onClick={() => router.push(`/dashboard/users/${client.id}`)}
            >
              <AvatarInitials name={client.displayName} />
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-sm font-bold truncate hover:text-primary transition-colors",
                    profile.adsRunning ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {client.displayName}
                  {isPepads && <span className={cn(PEPADS_BADGE_CLS, "ml-1.5")}>PepAds</span>}
                </p>
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
                      className="shrink-0 text-primary hover:opacity-70 transition-opacity"
                      title="Open website"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={client.status} />
        </td>
        {/* Stage */}
        <td className="px-4 py-3 min-w-[170px]">
          <ChipMultiSelect
            value={profile.stages}
            options={STAGE_OPTIONS}
            colorOf={(v) => STAGE_CHIP_CLS[v]}
            onChange={(stages) => patch(client, { stages })}
            addLabel="Add stage"
          />
        </td>
        {/* Client Health */}
        <td className="px-4 py-3 min-w-[170px]">
          <ChipMultiSelect
            value={profile.health}
            options={HEALTH_OPTIONS}
            colorOf={(v) => HEALTH_CHIP_CLS[v]}
            onChange={(health) => patch(client, { health })}
            addLabel="Add health"
          />
        </td>
        {/* Ads: running switch + platforms */}
        <td className="px-4 py-3 min-w-[160px]">
          <div className="space-y-1.5">
            <RunningSwitch
              running={profile.adsRunning}
              onToggle={() => patch(client, { adsRunning: !profile.adsRunning })}
            />
            <ChipMultiSelect
              value={profile.adPlatforms}
              options={platformOptions}
              colorOf={(v) => PLATFORM_CHIP_CLS[v]}
              onChange={(adPlatforms) => patch(client, { adPlatforms })}
              onCreateOption={addPlatformOption}
              addLabel="Add platform"
              compact
            />
          </div>
        </td>
        {/* Lead — Head of Ads */}
        <td className="px-4 py-3 min-w-[140px]">
          <TeamPicker
            role="lead"
            members={leads}
            onChange={(members) => saveTeam(client, "lead", members)}
          />
        </td>
        {/* Media Buyer */}
        <td className="px-4 py-3 min-w-[140px]">
          <TeamPicker
            role="media_buyer"
            members={buyers}
            onChange={(members) => saveTeam(client, "media_buyer", members)}
          />
        </td>
        {/* Services */}
        <td className="px-4 py-3 min-w-[200px]">
          <ChipMultiSelect
            value={profile.services}
            options={SERVICE_OPTIONS}
            colorOf={(v) => SERVICE_CHIP_CLS[v]}
            onChange={(services) => patch(client, { services })}
            addLabel="Add service"
          />
        </td>
        {/* Perf Fee (manual wins; derived from ad_accounts shown as auto) */}
        <td className="px-4 py-3 min-w-[90px]">
          <InlineTextCell
            value={profile.perfFee}
            placeholder="—"
            emptyDisplay={
              perfDerived ? (
                <span className="text-muted-foreground" title="Derived from linked ad accounts">
                  {perfDerived}
                  <span className="ml-1 text-[9px] uppercase opacity-60">auto</span>
                </span>
              ) : undefined
            }
            onSave={(v) => patch(client, { perfFee: v })}
          />
        </td>
        {/* Rev / Threshold */}
        <td className="px-4 py-3 min-w-[100px]">
          <InlineTextCell
            value={profile.revThreshold}
            placeholder="—"
            onSave={(v) => patch(client, { revThreshold: v })}
          />
        </td>
        <td className="px-4 py-3">
          <span className="text-sm text-foreground whitespace-nowrap">
            {formatDate(client.joinedAt)}
          </span>
        </td>
        {/* Monthly MRR — computed for agency; inline-editable for PepAds */}
        <td className="px-4 py-3 text-right">
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
              className="font-semibold"
            />
          ) : client.payoutMrr > 0 ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMrrClientId(client.id);
              }}
              className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 underline decoration-emerald-600/30 underline-offset-2 hover:decoration-emerald-600 transition-colors"
            >
              {formatMoney(client.payoutMrr)}
            </button>
          ) : (
            <span className="text-sm font-semibold text-foreground">
              {formatMoney(client.payoutMrr)}
            </span>
          )}
        </td>
        {/* LTV — all-time payout revenue; inline-editable for PepAds */}
        <td className="px-4 py-3 text-right">
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
            />
          ) : (
            <span className="text-sm font-medium text-foreground">
              {formatMoney(client.totalRevenue)}
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {formatDate(client.schedule.lastRebilledAt)}
          </span>
        </td>
        {/* Next Re-bill: computed for agency, manual for pepads */}
        <td className="px-4 py-3 min-w-[190px]">
          {isPepads ? (
            <div className="space-y-1.5">
              <ChipMultiSelect
                value={profile.manualBilling}
                options={MANUAL_BILLING_OPTIONS}
                colorOf={(v) => MANUAL_BILLING_CHIP_CLS[v]}
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
        </td>
        <td className="px-4 py-3 text-center">
          <span className="text-sm font-medium text-foreground">{client.accounts.length}</span>
        </td>
        {/* Quick notes */}
        <td className="px-4 py-3 min-w-[200px] max-w-[260px]">
          <InlineTextCell
            value={profile.rosterNotes}
            placeholder="Add notes…"
            multiline
            onSave={(v) => patch(client, { rosterNotes: v })}
            className="text-muted-foreground"
          />
        </td>
        <td className="px-4 py-3 text-right">
          <ClientActionsMenu
            client={client}
            onEdit={() => setEditingId(client.id)}
            onManageAccounts={() => setManagingId(client.id)}
            onArchive={() => handleArchive(client)}
            onDelete={() => handleDelete(client)}
          />
        </td>
      </tr>
    );
  }

  function renderGroupLabel(label: string, variant?: "top" | "pepads") {
    return (
      <tr className="border-b border-border/50">
        <td
          colSpan={COL_COUNT}
          className={cn(
            "px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider",
            variant === "top" && "bg-amber-500/[0.08] text-amber-600 dark:text-amber-400",
            variant === "pepads" &&
              "bg-orange-500/[0.08] text-orange-600 dark:text-orange-400 border-t-2 border-t-orange-500/30",
            !variant && "bg-muted/30 text-muted-foreground"
          )}
        >
          {label}
        </td>
      </tr>
    );
  }

  return (
    <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card overflow-hidden">
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left min-w-[2150px]">
          <thead>
            <tr className="bg-muted/30 dark:bg-white/[0.03] border-b border-border/50">
              <Th className="pl-4 sticky left-0 z-20 bg-card border-r border-border/40 min-w-[260px]">
                Client
              </Th>
              <Th>Status</Th>
              <Th>Stage</Th>
              <Th>Client Health</Th>
              <Th>Ads</Th>
              <Th>Head of Ads</Th>
              <Th>Media Buyer</Th>
              <Th>Services</Th>
              <Th>Perf Fee</Th>
              <Th>Rev / Threshold</Th>
              <Th>Date Joined</Th>
              <Th className="text-right">Monthly MRR</Th>
              <Th className="text-right">LTV</Th>
              <Th>Last Re-bill</Th>
              <Th>Next Re-bill</Th>
              <Th className="text-center">Accounts</Th>
              <Th>Notes</Th>
              <Th className="text-right pr-4">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr>
                <td
                  colSpan={COL_COUNT}
                  className="px-4 py-12 text-center text-sm text-muted-foreground"
                >
                  No clients match your filters.
                </td>
              </tr>
            ) : (
              <>
                {topAgency.length > 0 && (
                  <>
                    {renderGroupLabel(
                      `★ Top Clients · Agency Collective (${topAgency.length})`,
                      "top"
                    )}
                    {topAgency.map(renderRow)}
                  </>
                )}
                {(topAgency.length > 0 || pepadsTotal > 0) &&
                  renderGroupLabel(`Agency Collective (${agencyClients.length})`)}
                {paginated.map(renderRow)}
                {pepadsTotal > 0 && (
                  <>
                    {renderGroupLabel(
                      `📣 PepAds (${pepadsTotal}) · Separate book — statuses managed manually`,
                      "pepads"
                    )}
                    {topPepads.length > 0 && (
                      <>
                        {renderGroupLabel(
                          `★ Top Clients · PepAds (${topPepads.length})`,
                          "top"
                        )}
                        {topPepads.map(renderRow)}
                        {pepadsClients.length > 0 &&
                          renderGroupLabel(`All PepAds (${pepadsClients.length})`)}
                      </>
                    )}
                    {pepadsClients.map(renderRow)}
                  </>
                )}
              </>
            )}
          </tbody>
        </table>
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
            return (
              <div key={client.id}>
                {firstOfSection && (
                  <p
                    className={cn(
                      "px-1 pb-2 text-[10px] font-bold uppercase tracking-wider",
                      (section === "top" || section === "top-pepads") &&
                        "text-amber-600 dark:text-amber-400",
                      section === "agency" && "text-muted-foreground",
                      section === "top-pepads" && "pt-2 border-t-2 border-orange-500/30",
                      section === "pepads" &&
                        (topPepads.length > 0
                          ? "text-muted-foreground"
                          : "text-orange-600 dark:text-orange-400 pt-2 border-t-2 border-orange-500/30")
                    )}
                  >
                    {section === "top" &&
                      `★ Top Clients · Agency Collective (${topAgency.length})`}
                    {section === "agency" && `Agency Collective (${agencyClients.length})`}
                    {section === "top-pepads" &&
                      `📣 ★ Top Clients · PepAds (${topPepads.length})`}
                    {section === "pepads" &&
                      (topPepads.length > 0
                        ? `All PepAds (${pepadsClients.length})`
                        : `📣 PepAds (${pepadsClients.length}) · Separate book`)}
                  </p>
                )}
              <div
                className={cn(
                  "rounded-xl border border-border/50 dark:border-white/[0.06] p-4",
                  profile.isTop && "bg-amber-500/[0.05] border-amber-500/20"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div
                    className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer active:scale-[0.98] transition-all"
                    onClick={() => router.push(`/dashboard/users/${client.id}`)}
                  >
                    <AvatarInitials name={client.displayName} className="w-11 h-11" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">
                        {client.displayName}
                        {isPepads && (
                          <span className={cn(PEPADS_BADGE_CLS, "ml-1.5")}>PepAds</span>
                        )}
                      </p>
                      <StatusBadge status={client.status} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => patch(client, { isTop: !profile.isTop })}
                      className="p-1"
                      aria-label="Toggle top client"
                    >
                      <Star
                        className={cn(
                          "h-4 w-4",
                          profile.isTop
                            ? "text-amber-500 fill-amber-500"
                            : "text-muted-foreground/40"
                        )}
                      />
                    </button>
                    <ClientActionsMenu
                      client={client}
                      onEdit={() => setEditingId(client.id)}
                      onManageAccounts={() => setManagingId(client.id)}
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
                    options={STAGE_OPTIONS}
                    colorOf={(v) => STAGE_CHIP_CLS[v]}
                    onChange={(stages) => patch(client, { stages })}
                    compact
                  />
                  <ChipMultiSelect
                    value={profile.health}
                    options={HEALTH_OPTIONS}
                    colorOf={(v) => HEALTH_CHIP_CLS[v]}
                    onChange={(health) => patch(client, { health })}
                    compact
                  />
                </div>
                <div className="mt-3">
                  <RunningSwitch
                    running={profile.adsRunning}
                    onToggle={() => patch(client, { adsRunning: !profile.adsRunning })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                  <Field label="Joined" value={formatDate(client.joinedAt)} />
                  <Field
                    label="Monthly MRR"
                    value={formatMoney(effectiveMrrCents(client))}
                    onClick={
                      !isPepads && client.payoutMrr > 0
                        ? () => setMrrClientId(client.id)
                        : undefined
                    }
                  />
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase">
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
                    <p className="text-[10px] font-medium text-muted-foreground uppercase">
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
                  <Field
                    label="Last re-bill"
                    value={formatDate(client.schedule.lastRebilledAt)}
                  />
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase">
                      Next re-bill
                    </p>
                    <div className="mt-0.5 flex flex-col gap-1">
                      {isPepads ? (
                        <>
                          <ChipMultiSelect
                            value={profile.manualBilling}
                            options={MANUAL_BILLING_OPTIONS}
                            colorOf={(v) => MANUAL_BILLING_CHIP_CLS[v]}
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
        <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
          <p className="text-xs font-medium text-muted-foreground">
            Showing {paginated.length} of {agencyClients.length} Agency Collective
            {topAgency.length > 0 && ` · ${topAgency.length} top pinned`}
            {pepadsTotal > 0 && ` · ${pepadsTotal} PepAds below`}
          </p>
          <div className="flex gap-1.5">
            <button
              onClick={() => setPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              aria-label="Previous page"
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-border/50 text-sm hover:bg-muted/50 disabled:opacity-30 transition-colors"
            >
              &lsaquo;
            </button>
            {(() => {
              const maxButtons = 5;
              const half = Math.floor(maxButtons / 2);
              let start = Math.max(1, currentPage - half);
              const end = Math.min(totalPages, start + maxButtons - 1);
              if (end - start + 1 < maxButtons) start = Math.max(1, end - maxButtons + 1);
              return Array.from({ length: end - start + 1 }, (_, i) => {
                const pageNum = start + i;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={cn(
                      "w-8 h-8 flex items-center justify-center rounded-lg text-sm font-semibold transition-colors",
                      currentPage === pageNum
                        ? "text-white shadow-lg shadow-primary/20 ac-gradient"
                        : "border border-border/50 hover:bg-muted/50 text-foreground"
                    )}
                  >
                    {pageNum}
                  </button>
                );
              });
            })()}
            <button
              onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              aria-label="Next page"
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-border/50 text-sm hover:bg-muted/50 disabled:opacity-30 transition-colors"
            >
              &rsaquo;
            </button>
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
    </div>
  );
}

function RunningSwitch({ running, onToggle }: { running: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="inline-flex items-center gap-1.5"
      title={running ? "Ads running — click to pause" : "Ads paused — click to resume"}
    >
      <span
        className={cn(
          "relative inline-flex h-[18px] w-8 shrink-0 rounded-full transition-colors",
          running ? "bg-emerald-500" : "bg-muted-foreground/30"
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
            running ? "translate-x-[16px]" : "translate-x-[2px]"
          )}
        />
      </span>
      <span
        className={cn(
          "text-[11px] font-semibold",
          running ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
        )}
      >
        {running ? "Running" : "Paused"}
      </span>
    </button>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap",
        className
      )}
    >
      {children}
    </th>
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
      <p className="text-[10px] font-medium text-muted-foreground uppercase">{label}</p>
      {onClick ? (
        <button
          onClick={onClick}
          className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 underline decoration-emerald-600/30 underline-offset-2"
        >
          {value}
        </button>
      ) : (
        <p className="text-sm font-medium text-foreground mt-0.5">{value}</p>
      )}
    </div>
  );
}
