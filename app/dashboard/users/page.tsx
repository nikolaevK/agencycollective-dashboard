"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Plus } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { ClientDirectory } from "@/components/users/ClientDirectory";
import { ClientSummaryCards } from "@/components/users/ClientSummaryCards";
import { TeamFilterCards } from "@/components/users/TeamFilterCards";
import { RosterDashboard } from "@/components/users/RosterDashboard";
import {
  effectiveMrrCents,
  effectiveLtvCents,
  SERVICE_LABELS,
  MANUAL_BILLING_LABELS,
} from "@/components/users/rosterPresentation";
import { useAdPlatformOptions } from "@/hooks/useAdPlatformOptions";
import { useRosterOptions } from "@/hooks/useRosterOptions";
import { ClientFilters, DEFAULT_FILTERS, type ClientFilterState } from "@/components/users/ClientFilters";
import { AddClientModal } from "@/components/users/AddClientModal";
import { RebillAlertsPanel, useRebillAlerts } from "@/components/users/RebillAlertsPanel";
import { SentInvoicesPanel, useSentInvoices } from "@/components/users/SentInvoicesPanel";
import { UsersSupportTab } from "@/components/users/UsersSupportTab";
import { AdAccountsDirectory } from "@/components/users/AdAccountsDirectory";
import { QueryErrorState } from "@/components/shared/QueryErrorState";
import dynamic from "next/dynamic";
// Lazy-loaded: the builder pulls in react-markdown (via WelcomeKitRenderer)
// that only the rarely-opened Welcome Kit tab needs.
const WelcomeKitBuilder = dynamic(
  () =>
    import("@/components/users/WelcomeKitBuilder").then(
      (m) => m.WelcomeKitBuilder
    ),
  { ssr: false }
);
import { MaintenanceToggle } from "@/components/users/MaintenanceToggle";
import { cn } from "@/lib/utils";
import { useAdmin } from "@/components/providers/AdminProvider";
import type { ClientPublic } from "@/components/users/types";

type TabId = "clients" | "adAccounts" | "support" | "welcomeKit";

async function fetchClients(): Promise<ClientPublic[]> {
  const res = await fetch("/api/admin/users");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data as ClientPublic[];
}

function applyFilters(clients: ClientPublic[], f: ClientFilterState): ClientPublic[] {
  const q = f.search.trim().toLowerCase();
  const mrrMin = f.mrrMin ? Number(f.mrrMin) : null;
  const mrrMax = f.mrrMax ? Number(f.mrrMax) : null;

  return clients.filter((c) => {
    if (f.status !== "all" && c.status !== f.status) return false;
    if (f.category && c.category !== f.category) return false;
    if (f.rebill !== "all" && c.schedule.status !== f.rebill) return false;

    // Roster filters
    if (f.book !== "all" && c.profile.book !== f.book) return false;
    if (f.workspace !== "all" && c.workspace !== f.workspace) return false;
    if (f.stages.length > 0 && !f.stages.some((v) => c.profile.stages.includes(v)))
      return false;
    if (f.health.length > 0 && !f.health.some((v) => c.profile.health.includes(v)))
      return false;
    if (
      f.services.length > 0 &&
      !f.services.some((v) => c.profile.services.includes(v))
    )
      return false;
    if (
      f.platforms.length > 0 &&
      !f.platforms.some((v) => c.profile.adPlatforms.includes(v))
    )
      return false;
    if (
      f.team &&
      !c.team.some((m) => m.adminId === f.team!.adminId && m.role === f.team!.role)
    )
      return false;

    if (q) {
      const hay = `${c.displayName} ${c.email ?? ""} ${c.category ?? ""} ${
        c.payoutBrand ?? ""
      } ${c.profile.website ?? ""} ${c.profile.rosterNotes ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }

    const mrrDollars = c.payoutMrr / 100;
    if (mrrMin != null && mrrDollars < mrrMin) return false;
    if (mrrMax != null && mrrDollars > mrrMax) return false;

    if (f.joined.from && (!c.joinedAt || c.joinedAt < f.joined.from)) return false;
    if (f.joined.to && (!c.joinedAt || c.joinedAt > f.joined.to)) return false;

    const lr = c.schedule.lastRebilledAt;
    if (f.lastRebill.from && (!lr || lr < f.lastRebill.from)) return false;
    if (f.lastRebill.to && (!lr || lr > f.lastRebill.to)) return false;

    return true;
  });
}

function csvField(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Full roster (both books, every column) as CSV — mirrors the prototype's Copy CSV. */
function buildRosterCsv(
  clients: ClientPublic[],
  platformLabels: Record<string, string>,
  stageLabels: Record<string, string>,
  healthLabels: Record<string, string>
): string {
  const header = [
    "Client", "Book", "Status", "Website", "Stages", "Health", "Ad Platforms",
    "Ads Running", "Services", "Lead", "Media Buyer", "CSM", "Monthly MRR", "Perf Fee",
    "Rev Threshold", "LTV", "Billing Status", "Next Re-bill", "Last Re-bill",
    "Date Joined", "Notes",
  ];
  const lines = clients.map((c) => {
    const p = c.profile;
    const isPepads = p.book === "pepads";
    return [
      c.displayName,
      isPepads ? "PepAds" : "Agency Collective",
      c.status,
      p.website ?? "",
      p.stages.map((v) => stageLabels[v] ?? v).join("; "),
      p.health.map((v) => healthLabels[v] ?? v).join("; "),
      p.adPlatforms.map((v) => platformLabels[v] ?? v).join("; "),
      p.adsRunning ? "running" : "paused",
      p.services.map((v) => SERVICE_LABELS[v] ?? v).join("; "),
      c.team.filter((m) => m.role === "lead").map((m) => m.name).join("; "),
      c.team.filter((m) => m.role === "media_buyer").map((m) => m.name).join("; "),
      c.team.filter((m) => m.role === "csm").map((m) => m.name).join("; "),
      (effectiveMrrCents(c) / 100).toFixed(2),
      p.perfFee ?? c.derivedPerfFee ?? "",
      p.revThreshold ?? "",
      (effectiveLtvCents(c) / 100).toFixed(2),
      isPepads
        ? p.manualBilling.map((v) => MANUAL_BILLING_LABELS[v] ?? v).join("; ")
        : c.schedule.status,
      isPepads ? p.manualNextRebill ?? "" : c.schedule.nextRebillAt ?? "",
      c.schedule.lastRebilledAt ?? "",
      c.joinedAt ?? "",
      p.rosterNotes ?? "",
    ]
      .map(csvField)
      .join(",");
  });
  return [header.map(csvField).join(","), ...lines].join("\n");
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const admin = useAdmin();
  const [tab, setTab] = useState<TabId>("clients");
  const [filters, setFilters] = useState<ClientFilterState>(DEFAULT_FILTERS);
  const [showAdd, setShowAdd] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [sentInvoicesOpen, setSentInvoicesOpen] = useState(false);
  const [csvCopied, setCsvCopied] = useState(false);
  const { platformLabels } = useAdPlatformOptions();
  const { labels: stageLabels } = useRosterOptions("stage");
  const { labels: healthLabels } = useRosterOptions("health");

  const { data: unreadSupport = 0 } = useQuery<number>({
    queryKey: ["admin-support-unread"],
    queryFn: async () => {
      const res = await fetch("/api/admin/support/unread");
      if (!res.ok) return 0;
      const json = await res.json();
      return Number(json.data?.count ?? 0);
    },
    staleTime: 45_000,
    refetchInterval: 90_000,
    refetchIntervalInBackground: false,
  });

  const {
    data: clients = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["admin-users"],
    queryFn: fetchClients,
    // The server-side directory build is expensive (~9 queries + invoice
    // reconciliation) — don't re-trigger it on every tab refocus; mutations
    // invalidate this key explicitly.
    staleTime: 600_000,
    refetchOnWindowFocus: false,
    enabled: tab === "clients",
  });

  // Shared with the alerts panel via the same query key (deduped).
  const { data: alerts } = useRebillAlerts();
  // Same dedupe pattern — feeds the summary card + the SentInvoicesPanel.
  const { data: sentInvoices } = useSentInvoices();

  const filtered = useMemo(() => applyFilters(clients, filters), [clients, filters]);

  // Workspace CONTEXT (not just a row filter): when a workspace is selected,
  // every number on the page — summary cards, roster count groups, per-person
  // team cards, alert/sent-invoice counts and panels — computes from that
  // book's subset, so the page reads as that workspace's directory.
  const workspaceClients = useMemo(
    () =>
      filters.workspace === "all"
        ? clients
        : clients.filter((c) => c.workspace === filters.workspace),
    [clients, filters.workspace]
  );
  const workspaceClientIds = useMemo(
    () =>
      filters.workspace === "all"
        ? null
        : new Set(workspaceClients.map((c) => c.id)),
    [workspaceClients, filters.workspace]
  );

  // Inactive/archived clients keep their table row (with its own values) but
  // drop out of every aggregate on the page: roster count groups, per-person
  // team cards, and the summary totals below.
  const countable = useMemo(
    () =>
      workspaceClients.filter(
        (c) => c.status !== "inactive" && c.status !== "archived"
      ),
    [workspaceClients]
  );

  // Monthly MRR reflects ACTIVE clients only (same definition as the "Active"
  // card below) — paused/onboarding/inactive/archived clients don't count
  // toward recurring revenue even though their row still shows its own MRR.
  // PepAds clients contribute their manual MRR (their book has no payout-
  // derived recurring revenue).
  const totalMrr = workspaceClients.reduce(
    (s, c) => s + (c.status === "active" ? effectiveMrrCents(c) : 0),
    0
  );
  const activeClients = workspaceClients.filter((c) => c.status === "active").length;

  // Alert / sent-invoice counts scoped to the workspace context (the shared
  // queries are actor-scoped server-side, which for an unscoped admin means
  // ALL books — the page trims them to the selected one).
  const visibleRebills = (alerts?.rebills ?? []).filter(
    (r) => !workspaceClientIds || workspaceClientIds.has(r.id)
  );
  const visibleSentInvoices = (sentInvoices?.invoices ?? []).filter(
    (i) => !workspaceClientIds || workspaceClientIds.has(i.userId)
  );

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    queryClient.invalidateQueries({ queryKey: ["admin-rebill-alerts"] });
    queryClient.invalidateQueries({ queryKey: ["admin-sent-invoices"] });
  }

  async function handleCopyCsv() {
    try {
      await navigator.clipboard.writeText(
        buildRosterCsv(workspaceClients, platformLabels, stageLabels, healthLabels)
      );
      setCsvCopied(true);
      setTimeout(() => setCsvCopied(false), 2000);
    } catch {
      alert("Could not copy to clipboard.");
    }
  }

  return (
    <DashboardShell wide>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl lg:text-3xl font-black text-foreground">Client Directory</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Cross-referenced with the Payout DB — MRR, join dates, billing schedule.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex bg-muted rounded-lg p-1 self-start max-w-full overflow-x-auto">
              <TabButton active={tab === "clients"} onClick={() => setTab("clients")}>
                Directory
              </TabButton>
              <TabButton active={tab === "adAccounts"} onClick={() => setTab("adAccounts")}>
                Ad Accounts
              </TabButton>
              <TabButton
                active={tab === "support"}
                onClick={() => setTab("support")}
                badge={unreadSupport}
              >
                Support
              </TabButton>
              {!admin.isExternal && (
                <TabButton active={tab === "welcomeKit"} onClick={() => setTab("welcomeKit")}>
                  Welcome Kit
                </TabButton>
              )}
            </div>
            {!admin.isExternal && <MaintenanceToggle />}
            {tab === "clients" && (
              <>
                <button
                  onClick={handleCopyCsv}
                  disabled={workspaceClients.length === 0}
                  className="hidden md:flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-40 transition-colors"
                  title="Copy the roster (all columns, current workspace, ignoring other filters) as CSV"
                >
                  {csvCopied ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {csvCopied ? "Copied" : "Copy CSV"}
                </button>
                <button
                  onClick={() => setShowAdd(true)}
                  className="hidden md:flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white shadow-lg shadow-primary/20 ac-gradient hover:opacity-90 active:scale-95 transition-all"
                >
                  <Plus className="h-4 w-4" />
                  Add Client
                </button>
              </>
            )}
          </div>
        </div>

        {tab === "clients" && (
          <>
            <ClientSummaryCards
              totalClients={workspaceClients.length}
              activeClients={activeClients}
              totalMrr={totalMrr}
              rebillsDue={visibleRebills.length}
              overdueCount={visibleRebills.filter((r) => r.status === "overdue").length}
              sentInvoices={visibleSentInvoices.length}
              onRebillsClick={() => setAlertsOpen(true)}
              onSentInvoicesClick={() => setSentInvoicesOpen(true)}
              isLoading={isLoading}
            />

            <RebillAlertsPanel
              open={alertsOpen}
              onOpenChange={setAlertsOpen}
              restrictToUserIds={workspaceClientIds}
            />
            <SentInvoicesPanel
              open={sentInvoicesOpen}
              onOpenChange={setSentInvoicesOpen}
              restrictToUserIds={workspaceClientIds}
            />

            <RosterDashboard
              clients={countable}
              filters={filters}
              onFiltersChange={setFilters}
            />

            <TeamFilterCards
              clients={countable}
              selected={filters.team}
              onSelect={(team) => setFilters((f) => ({ ...f, team }))}
            />

            <ClientFilters value={filters} onChange={setFilters} />

            {isError ? (
              <QueryErrorState
                title="Couldn't load the Client Directory"
                onRetry={() => refetch()}
              />
            ) : isLoading ? (
              <div className="rounded-xl border border-border/50 bg-card p-8">
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="h-12 w-full animate-pulse rounded-lg bg-muted/60" />
                  ))}
                </div>
              </div>
            ) : (
              <ClientDirectory
                clients={filtered}
                onRefresh={handleRefresh}
                resetKey={JSON.stringify(filters)}
              />
            )}
          </>
        )}

        {tab === "adAccounts" && <AdAccountsDirectory />}

        {tab === "support" && <UsersSupportTab />}

        {tab === "welcomeKit" && !admin.isExternal && <WelcomeKitBuilder />}
      </div>

      {/* Mobile FAB */}
      {tab === "clients" && (
        <button
          onClick={() => setShowAdd(true)}
          className="md:hidden fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl shadow-primary/30 ac-gradient active:scale-95 transition-transform"
          aria-label="Add client"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {showAdd && (
        <AddClientModal onClose={() => setShowAdd(false)} onCreated={handleRefresh} />
      )}
    </DashboardShell>
  );
}

function TabButton({
  active,
  onClick,
  children,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-4 py-1.5 rounded-md text-sm font-semibold transition-colors flex items-center gap-2",
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span className="inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}
