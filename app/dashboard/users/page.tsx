"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { CreateUserForm } from "@/components/users/CreateUserForm";
import { AccountUtilization } from "@/components/users/AccountUtilization";
import { ClientDirectory } from "@/components/users/ClientDirectory";
import type { ClientPublic } from "@/components/users/types";

async function fetchClients(): Promise<ClientPublic[]> {
  const res = await fetch("/api/admin/users");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data as ClientPublic[];
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { data: clients, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: fetchClients,
    staleTime: 30_000,
  });

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  }

  const totalAccounts = clients?.reduce((sum, c) => sum + c.accounts.length, 0) ?? 0;
  const activeClients = clients?.filter((c) => c.status === "active").length ?? 0;

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-foreground">Clients</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage client accounts, assign Meta ad accounts, and track MRR.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left column */}
          <div className="lg:col-span-4 space-y-6">
            <CreateUserForm onCreated={handleRefresh} />
            <AccountUtilization
              assignedAccounts={totalAccounts}
              totalClients={activeClients}
            />
          </div>

          {/* Right column — stretches to match left column height */}
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
      </div>
    </DashboardShell>
  );
}
