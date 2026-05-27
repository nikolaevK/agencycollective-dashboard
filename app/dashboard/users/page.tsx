"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { ClientDirectory } from "@/components/users/ClientDirectory";
import { ClientSummaryCards } from "@/components/users/ClientSummaryCards";
import { ClientFilters, DEFAULT_FILTERS, type ClientFilterState } from "@/components/users/ClientFilters";
import { AddClientModal } from "@/components/users/AddClientModal";
import { RebillAlertsPanel, useRebillAlerts } from "@/components/users/RebillAlertsPanel";
import { SentInvoicesPanel, useSentInvoices } from "@/components/users/SentInvoicesPanel";
import { UsersSupportTab } from "@/components/users/UsersSupportTab";
import { WelcomeKitBuilder } from "@/components/users/WelcomeKitBuilder";
import { cn } from "@/lib/utils";
import type { ClientPublic } from "@/components/users/types";

type TabId = "clients" | "support" | "welcomeKit";

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

    if (q) {
      const hay = `${c.displayName} ${c.email ?? ""} ${c.category ?? ""} ${
        c.payoutBrand ?? ""
      }`.toLowerCase();
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

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabId>("clients");
  const [filters, setFilters] = useState<ClientFilterState>(DEFAULT_FILTERS);
  const [showAdd, setShowAdd] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [sentInvoicesOpen, setSentInvoicesOpen] = useState(false);

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

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: fetchClients,
    staleTime: 30_000,
    enabled: tab === "clients",
  });

  // Shared with the alerts panel via the same query key (deduped).
  const { data: alerts } = useRebillAlerts();
  // Same dedupe pattern — feeds the summary card + the SentInvoicesPanel.
  const { data: sentInvoices } = useSentInvoices();

  const filtered = useMemo(() => applyFilters(clients, filters), [clients, filters]);

  // Monthly MRR reflects ACTIVE clients only (same definition as the "Active"
  // card below) — paused/onboarding/inactive/archived clients don't count
  // toward recurring revenue even though their row still shows its own MRR.
  const totalMrr = clients.reduce(
    (s, c) => s + (c.status === "active" ? c.payoutMrr : 0),
    0
  );
  const activeClients = clients.filter((c) => c.status === "active").length;

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    queryClient.invalidateQueries({ queryKey: ["admin-rebill-alerts"] });
    queryClient.invalidateQueries({ queryKey: ["admin-sent-invoices"] });
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
          <div className="flex items-center gap-3">
            <div className="flex bg-muted rounded-lg p-1 self-start">
              <TabButton active={tab === "clients"} onClick={() => setTab("clients")}>
                Directory
              </TabButton>
              <TabButton
                active={tab === "support"}
                onClick={() => setTab("support")}
                badge={unreadSupport}
              >
                Support
              </TabButton>
              <TabButton active={tab === "welcomeKit"} onClick={() => setTab("welcomeKit")}>
                Welcome Kit
              </TabButton>
            </div>
            {tab === "clients" && (
              <button
                onClick={() => setShowAdd(true)}
                className="hidden md:flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white shadow-lg shadow-primary/20 ac-gradient hover:opacity-90 active:scale-95 transition-all"
              >
                <Plus className="h-4 w-4" />
                Add Client
              </button>
            )}
          </div>
        </div>

        {tab === "clients" && (
          <>
            <ClientSummaryCards
              totalClients={clients.length}
              activeClients={activeClients}
              totalMrr={totalMrr}
              rebillsDue={alerts?.rebills.length ?? 0}
              overdueCount={alerts?.overdueCount ?? 0}
              sentInvoices={sentInvoices?.count ?? 0}
              onRebillsClick={() => setAlertsOpen(true)}
              onSentInvoicesClick={() => setSentInvoicesOpen(true)}
              isLoading={isLoading}
            />

            <RebillAlertsPanel open={alertsOpen} onOpenChange={setAlertsOpen} />
            <SentInvoicesPanel
              open={sentInvoicesOpen}
              onOpenChange={setSentInvoicesOpen}
            />

            <ClientFilters value={filters} onChange={setFilters} />

            {isLoading ? (
              <div className="rounded-xl border border-border/50 bg-card p-8">
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="h-12 w-full animate-pulse rounded-lg bg-muted/60" />
                  ))}
                </div>
              </div>
            ) : (
              <ClientDirectory clients={filtered} onRefresh={handleRefresh} />
            )}
          </>
        )}

        {tab === "support" && <UsersSupportTab />}

        {tab === "welcomeKit" && <WelcomeKitBuilder />}
      </div>

      {/* Mobile FAB */}
      {tab === "clients" && (
        <button
          onClick={() => setShowAdd(true)}
          className="md:hidden fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl shadow-primary/30 ac-gradient active:scale-95 transition-transform"
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
