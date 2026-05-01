"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { CreateUserForm } from "@/components/users/CreateUserForm";
import { AccountUtilization } from "@/components/users/AccountUtilization";
import { ClientDirectory } from "@/components/users/ClientDirectory";
import { UsersSupportTab } from "@/components/users/UsersSupportTab";
import { cn } from "@/lib/utils";
import type { ClientPublic } from "@/components/users/types";

type TabId = "clients" | "support";

async function fetchClients(): Promise<ClientPublic[]> {
  const res = await fetch("/api/admin/users");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data as ClientPublic[];
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabId>("clients");

  // Unread count drives the badge on the Support tab pill so admins see
  // incoming messages even when they're sitting on the Clients tab.
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

  const { data: clients, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: fetchClients,
    staleTime: 30_000,
    enabled: tab === "clients",
  });

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  }

  const totalAccounts = clients?.reduce((sum, c) => sum + c.accounts.length, 0) ?? 0;
  const activeClients = clients?.filter((c) => c.status === "active").length ?? 0;

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl lg:text-3xl font-black text-foreground">Clients</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage client accounts, assign Meta ad accounts, and respond to feedback.
            </p>
          </div>
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
          </div>
        </div>

        {tab === "clients" ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 space-y-6">
              <CreateUserForm onCreated={handleRefresh} />
              <AccountUtilization
                assignedAccounts={totalAccounts}
                totalClients={activeClients}
              />
            </div>

            <div className="lg:col-span-8 flex flex-col">
              {isLoading ? (
                <div className="bg-card rounded-2xl shadow-sm border border-border/50 dark:border-white/[0.06] p-8 flex-1">
                  <div className="space-y-4">
                    <div className="h-6 w-48 animate-pulse rounded-lg bg-muted" />
                    <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
                    <div className="space-y-3 mt-6">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="h-14 w-full animate-pulse rounded-lg bg-muted/60" />
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-h-0">
                  <ClientDirectory
                    clients={clients ?? []}
                    onRefresh={handleRefresh}
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          <UsersSupportTab />
        )}
      </div>
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
