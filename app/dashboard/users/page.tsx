"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Bot, Check, Copy, Plus } from "lucide-react";
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
import { RebillAlertsPanel } from "@/components/users/RebillAlertsPanel";
import { useRebillAlerts } from "@/components/users/useRebillAlerts";
import { SentInvoicesPanel, useSentInvoices } from "@/components/users/SentInvoicesPanel";
import { InvoiceDraftsPanel, useInvoiceDrafts } from "@/components/users/InvoiceDraftsList";
import { useNewOfferRequestCount } from "@/components/offers/admin/OfferRequestsInbox";
import { QueryErrorState } from "@/components/shared/QueryErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import type { ClientTrends } from "@/lib/clientTrendSeries";
import { businessTodayYmd } from "@/lib/businessTime";
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
// Lazy: the other tabs and the Add Client modal load when first opened, so
// the Directory's first load doesn't ship them.
const AdAccountsDirectory = dynamic(() => import("@/components/users/AdAccountsDirectory").then((m) => m.AdAccountsDirectory), { loading: () => <Skeleton className="h-[420px] w-full rounded-3xl" /> });
const UsersSupportTab = dynamic(() => import("@/components/users/UsersSupportTab").then((m) => m.UsersSupportTab), { loading: () => <Skeleton className="h-[420px] w-full rounded-3xl" /> });
const PeptideAiUsageTab = dynamic(() => import("@/components/users/PeptideAiUsageTab").then((m) => m.PeptideAiUsageTab), { loading: () => <Skeleton className="h-[420px] w-full rounded-3xl" /> });
const CrossSellTab = dynamic(() => import("@/components/offers/admin/CrossSellTab").then((m) => m.CrossSellTab), { loading: () => <Skeleton className="h-[420px] w-full rounded-3xl" /> });
const AddClientModal = dynamic(() => import("@/components/users/AddClientModal").then((m) => m.AddClientModal), { ssr: false });
// Lazy: the Insights view is the only recharts-heavy part of the tab.
const ClientInsights = dynamic(
  () => import("@/components/users/ClientInsights").then((m) => m.ClientInsights),
  { loading: () => <Skeleton className="h-[380px] w-full rounded-3xl" /> }
);
import { MaintenanceToggle } from "@/components/users/MaintenanceToggle";
import { useAdmin } from "@/components/providers/AdminProvider";
import type { ClientPublic } from "@/components/users/types";

type TabId = "clients" | "adAccounts" | "support" | "welcomeKit" | "peptideAi" | "crossSell";
type DirectoryView = "roster" | "insights";

// Stable empty list while loading — a fresh [] per render would re-run every
// memo (and memoized chart) below it.
const NO_CLIENTS: ClientPublic[] = [];

async function fetchClientTrends(): Promise<ClientTrends> {
  const res = await fetch("/api/admin/clients/trends");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data as ClientTrends;
}

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
    // PepAds rows show MANUAL billing chips, not the computed status — a
    // computed-status filter must not match them (the row would read e.g.
    // "Overdue" in the filter but show its manual chip in the table).
    if (f.rebill !== "all" && (c.profile.book === "pepads" || c.schedule.status !== f.rebill))
      return false;

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
  const router = useRouter();
  const admin = useAdmin();
  const [tab, setTab] = useState<TabId>("clients");
  const [view, setView] = useState<DirectoryView>("roster");
  // Invoice drafts awaiting review (agent-prepared or saved from a drawer).
  const [draftsOpen, setDraftsOpen] = useState(false);
  const { data: pendingDrafts = [] } = useInvoiceDrafts();
  // Push notifications deep-link here with ?drafts=1 / ?tab=crossSell.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("drafts") === "1") setDraftsOpen(true);
    if (params.get("tab") === "crossSell" && !admin.isExternal) setTab("crossSell");
  }, [admin.isExternal]);
  function closeDrafts() {
    setDraftsOpen(false);
    // Drop the deep-link param (keeping the rest) so a reload/Back doesn't reopen the panel.
    const params = new URLSearchParams(window.location.search);
    if (!params.has("drafts")) return;
    params.delete("drafts");
    const qs = params.toString();
    router.replace(`${window.location.pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }
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

  // Portal service requests (More from Agency Collective) — "New" badge on the Cross-sell tab.
  const newOfferRequests = useNewOfferRequestCount(!admin.isExternal);

  const {
    data: clients = NO_CLIENTS,
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

  // Read-only 12-month payout activity per client — card trend lines + Insights.
  const {
    data: trends,
    isLoading: trendsLoading,
    isError: trendsError,
  } = useQuery({
    queryKey: ["admin-client-trends"],
    queryFn: fetchClientTrends,
    staleTime: 600_000,
    refetchOnWindowFocus: false,
    enabled: tab === "clients",
  });
  // The business month the cards describe: the trend window's last month
  // (server); the same business-timezone month until it loads.
  const month = trends?.months[trends.months.length - 1] ?? businessTodayYmd().slice(0, 7);
  const { workspaces } = useWorkspaces();
  const scopeLabel =
    filters.workspace === "all"
      ? workspaces.length > 1
        ? "All workspaces"
        : "All clients"
      : workspaces.find((w) => w.value === filters.workspace)?.label ?? filters.workspace;

  // Shared with the alerts panel via the same query key (deduped).
  const { data: alerts, isError: alertsError } = useRebillAlerts();
  // Same dedupe pattern — feeds the summary card + the SentInvoicesPanel.
  const { data: sentInvoices, isError: sentInvoicesError } = useSentInvoices();

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
    queryClient.invalidateQueries({ queryKey: ["admin-client-trends"] });
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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl lg:text-3xl font-semibold tracking-tight">Client Directory</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Cross-referenced with the Payout DB — MRR, join dates, billing schedule.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!admin.isExternal && <MaintenanceToggle />}
            {(tab === "clients" || tab === "adAccounts") && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setDraftsOpen(true)}
                title="Invoice drafts awaiting review"
              >
                <Bot />
                Drafts
                {pendingDrafts.length > 0 && (
                  <Badge variant="secondary" className="ml-0.5 h-5 min-w-5 px-1.5 tabular-nums">
                    {pendingDrafts.length}
                  </Badge>
                )}
              </Button>
            )}
            {tab === "clients" && (
              <>
                <Button
                  variant="outline"
                  onClick={handleCopyCsv}
                  disabled={workspaceClients.length === 0}
                  className="hidden md:inline-flex"
                  title="Copy the roster (all columns, current workspace, ignoring other filters) as CSV"
                >
                  {csvCopied ? <Check className="text-emerald-600 dark:text-emerald-400" /> : <Copy />}
                  {csvCopied ? "Copied" : "Copy CSV"}
                </Button>
                <Button onClick={() => setShowAdd(true)} className="hidden md:inline-flex">
                  <Plus />
                  Add Client
                </Button>
              </>
            )}
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
          <div className="overflow-x-auto">
            <TabsList>
              <TabsTrigger value="clients">Directory</TabsTrigger>
              <TabsTrigger value="adAccounts">Ad Accounts</TabsTrigger>
              <TabsTrigger value="support">
                Support
                <CountBadge count={unreadSupport} />
              </TabsTrigger>
              <TabsTrigger value="peptideAi">Peptide AI</TabsTrigger>
              {!admin.isExternal && <TabsTrigger value="welcomeKit">Welcome Kit</TabsTrigger>}
              {!admin.isExternal && (
                <TabsTrigger value="crossSell">
                  Cross-sell
                  <CountBadge count={newOfferRequests} />
                </TabsTrigger>
              )}
            </TabsList>
          </div>
        </Tabs>

        {tab === "clients" && (
          <>
            <ClientSummaryCards
              clients={workspaceClients}
              trends={trends}
              trendsLoading={trendsLoading}
              month={month}
              rebillsDue={alertsError && !alerts ? null : visibleRebills.length}
              overdueCount={visibleRebills.filter((r) => r.status === "overdue").length}
              dueMrr={visibleRebills.reduce((s, r) => s + r.payoutMrr, 0)}
              sentInvoices={sentInvoicesError && !sentInvoices ? null : visibleSentInvoices.length}
              sentAmount={visibleSentInvoices.reduce((s, i) => s + i.amountCents, 0)}
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

            {/* Panels inherit the page's type (TabsContent defaults to text-sm). */}
            <Tabs value={view} onValueChange={(v) => setView(v as DirectoryView)} className="space-y-6">
              <TabsList>
                <TabsTrigger value="roster">Roster</TabsTrigger>
                <TabsTrigger value="insights">Insights</TabsTrigger>
              </TabsList>

              <TabsContent value="insights" className="text-[length:inherit] leading-[inherit]">
                {isError ? (
                  <QueryErrorState
                    title="Couldn't load the Client Directory"
                    onRetry={() => refetch()}
                  />
                ) : isLoading ? (
                  <Skeleton className="h-[380px] w-full rounded-3xl" />
                ) : (
                  <ClientInsights
                    clients={workspaceClients}
                    trends={trends}
                    trendsError={trendsError}
                    month={month}
                    scopeLabel={scopeLabel}
                  />
                )}
              </TabsContent>

              {/* Kept mounted while Insights is open: switching back doesn't
                  rebuild the table or reset its filters/pagination. */}
              <TabsContent
                value="roster"
                forceMount
                className="space-y-6 text-[length:inherit] leading-[inherit] data-[state=inactive]:hidden"
              >
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
                  <Card>
                    <CardContent className="space-y-3 p-6 md:p-6">
                      {[1, 2, 3, 4, 5, 6].map((i) => (
                        <Skeleton key={i} className="h-12 w-full rounded-2xl" />
                      ))}
                    </CardContent>
                  </Card>
                ) : (
                  <ClientDirectory
                    clients={filtered}
                    onRefresh={handleRefresh}
                    resetKey={JSON.stringify(filters)}
                  />
                )}
              </TabsContent>
            </Tabs>
          </>
        )}

        {tab === "adAccounts" && <AdAccountsDirectory />}

        {tab === "support" && <UsersSupportTab />}

        {tab === "peptideAi" && <PeptideAiUsageTab />}

        {tab === "welcomeKit" && !admin.isExternal && <WelcomeKitBuilder />}

        {tab === "crossSell" && !admin.isExternal && <CrossSellTab newRequests={newOfferRequests} />}
      </div>

      {/* Mobile FAB */}
      {tab === "clients" && (
        <Button
          onClick={() => setShowAdd(true)}
          size="icon-lg"
          className="md:hidden fixed bottom-20 right-4 z-40 size-14 rounded-full shadow-lg [&_svg:not([class*='size-'])]:size-6"
          aria-label="Add client"
        >
          <Plus />
        </Button>
      )}

      {showAdd && (
        <AddClientModal onClose={() => setShowAdd(false)} onCreated={handleRefresh} />
      )}

      {draftsOpen && <InvoiceDraftsPanel onClose={closeDrafts} />}
    </DashboardShell>
  );
}

/** Attention count on a tab (unread support threads, new service requests). */
function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white tabular-nums">
      {count > 99 ? "99+" : count}
    </span>
  );
}
