"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Mail,
  Calendar,
  DollarSign,
  Pencil,
  Link2,
  Eye,
  ExternalLink,
  TrendingUp,
  ShoppingCart,
  Banknote,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { StatusBadge } from "@/components/users/StatusBadge";
import { AvatarInitials } from "@/components/users/AvatarInitials";
import { EditClientModal } from "@/components/users/EditClientModal";
import { ManageAccountsModal } from "@/components/users/ManageAccountsModal";
import { useInsights } from "@/hooks/useInsights";
import { useAccounts } from "@/hooks/useAccounts";
import { useDateRange } from "@/hooks/useDateRange";
import { cn, formatCurrency, formatRoas } from "@/lib/utils";
import { useState } from "react";
import type { ClientPublic } from "@/components/users/types";
import type { ClientAccount } from "@/lib/clientAccounts";

interface ClientProfilePageProps {
  params: { userId: string };
}

async function fetchClient(userId: string): Promise<ClientPublic> {
  const res = await fetch("/api/admin/users");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const clients = json.data as ClientPublic[];
  const client = clients.find((c) => c.id === userId);
  if (!client) throw new Error("Client not found");
  return client;
}

function formatMrr(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ---------- Mini KPI card per linked account ----------

function AccountKpiCard({ account }: { account: ClientAccount }) {
  const { dateRange } = useDateRange();
  const { data, isLoading } = useInsights(account.accountId, dateRange);
  const { data: metaAccounts } = useAccounts(dateRange);
  const router = useRouter();

  // Show real Meta account status instead of internal is_active flag
  const metaAccount = metaAccounts?.find((a) => a.id === account.accountId);
  const metaStatus = metaAccount?.status;
  const isMetaActive = metaStatus === "ACTIVE";

  return (
    <div
      onClick={() => router.push(`/dashboard/accounts/${account.accountId}`)}
      className="group bg-card rounded-xl border border-border/50 dark:border-white/[0.06] p-5 hover:border-primary/30 hover:shadow-md cursor-pointer transition-all"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground truncate">
            {account.label || metaAccount?.name || account.accountId}
          </p>
          {(account.label || metaAccount?.name) && (
            <p className="text-xs text-muted-foreground font-mono">{account.accountId}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {metaStatus ? (
            <span className={cn(
              "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
              isMetaActive
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-red-500/10 text-red-600 dark:text-red-400"
            )}>
              {metaStatus}
            </span>
          ) : !account.isActive ? (
            <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded-full text-[10px] font-bold uppercase">
              Unlinked
            </span>
          ) : null}
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 w-12 animate-pulse rounded bg-muted" />
              <div className="h-5 w-16 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="flex items-center gap-1 mb-0.5">
              <DollarSign className="h-3 w-3 text-muted-foreground" />
              <p className="text-[10px] font-bold text-muted-foreground uppercase">Spend</p>
            </div>
            <p className="text-sm font-bold text-foreground">{formatCurrency(data.metrics.spend)}</p>
          </div>
          <div>
            <div className="flex items-center gap-1 mb-0.5">
              <TrendingUp className="h-3 w-3 text-muted-foreground" />
              <p className="text-[10px] font-bold text-muted-foreground uppercase">ROAS</p>
            </div>
            <p className="text-sm font-bold text-foreground">{formatRoas(data.metrics.roas)}</p>
          </div>
          <div>
            <div className="flex items-center gap-1 mb-0.5">
              <ShoppingCart className="h-3 w-3 text-muted-foreground" />
              <p className="text-[10px] font-bold text-muted-foreground uppercase">Conv.</p>
            </div>
            <p className="text-sm font-bold text-foreground">
              {new Intl.NumberFormat("en-US").format(data.metrics.conversions)}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No data available</p>
      )}
    </div>
  );
}

// ---------- Main page ----------

export default function ClientProfilePage({ params }: ClientProfilePageProps) {
  const router = useRouter();
  const [showEdit, setShowEdit] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);

  const { data: client, isLoading, refetch } = useQuery({
    queryKey: ["admin-user", params.userId],
    queryFn: () => fetchClient(params.userId),
    staleTime: 0,
  });

  if (isLoading) {
    return (
      <DashboardShell>
        <div className="space-y-6 max-w-4xl">
          <div className="h-6 w-32 animate-pulse rounded-lg bg-muted" />
          <div className="h-48 w-full animate-pulse rounded-2xl bg-muted" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        </div>
      </DashboardShell>
    );
  }

  if (!client) {
    return (
      <DashboardShell>
        <div className="text-center py-20">
          <p className="text-muted-foreground">Client not found.</p>
          <button
            onClick={() => router.push("/dashboard/users")}
            className="mt-4 text-sm text-primary hover:underline"
          >
            Back to Clients
          </button>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="space-y-6 max-w-4xl">
        {/* Back link */}
        <button
          onClick={() => router.push("/dashboard/users")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Clients
        </button>

        {/* Client header card */}
        <div className="bg-card rounded-2xl border border-border/50 dark:border-white/[0.06] shadow-sm overflow-hidden">
          {/* Gradient banner */}
          <div className="h-24 ac-gradient" />

          <div className="p-6 lg:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              {client.logoPath ? (
                <img
                  src={client.logoPath}
                  alt={client.displayName}
                  className="w-14 h-14 object-contain rounded-xl shrink-0"
                />
              ) : (
                <AvatarInitials name={client.displayName} className="w-14 h-14 text-lg shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-black text-foreground">{client.displayName}</h1>
                  <StatusBadge status={client.status} />
                  {!client.email && (
                    <span className="px-2 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded text-[10px] font-bold uppercase">
                      No email
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-1.5 flex-wrap text-sm text-muted-foreground">
                  {client.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5" />
                      {client.email}
                    </span>
                  )}
                  {client.category && (
                    <span className="px-2 py-0.5 bg-muted/50 rounded-full text-xs font-medium">
                      {client.category}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Joined {formatDate(client.createdAt)}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setShowEdit(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  onClick={() => setShowAccounts(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Manage Accounts
                </button>
                {client.slug && (
                  <a
                    href={`/${client.slug}/portal/overview`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-opacity ac-gradient"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View Portal
                  </a>
                )}
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-border/50">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Monthly MRR</p>
                <p className="text-xl font-black text-foreground">{formatMrr(client.mrr)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Linked Accounts</p>
                <p className="text-xl font-black text-foreground">{client.accounts.length}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Displayed Accounts</p>
                <p className="text-xl font-black text-foreground">
                  {client.accounts.filter((a) => a.isActive).length}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Password</p>
                <p className="text-xl font-black text-foreground">
                  {client.hasPassword ? (
                    <span className="text-emerald-600 dark:text-emerald-400">Set</span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">Pending</span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Linked accounts with KPIs */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">Linked Meta Accounts</h2>
              <p className="text-sm text-muted-foreground">
                Click an account to view its full dashboard.
              </p>
            </div>
            <button
              onClick={() => setShowAccounts(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
            >
              <Link2 className="h-3.5 w-3.5" />
              Manage
            </button>
          </div>

          {client.accounts.length === 0 ? (
            <div className="bg-card rounded-xl border border-border/50 dark:border-white/[0.06] p-8 text-center">
              <Banknote className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No Meta accounts linked yet.{" "}
                <button onClick={() => setShowAccounts(true)} className="text-primary hover:underline">
                  Add one
                </button>
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {client.accounts.map((account) => (
                <AccountKpiCard key={account.id} account={account} />
              ))}
            </div>
          )}
        </div>

        {/* Modals */}
        {showEdit && (
          <EditClientModal
            client={client}
            onClose={() => setShowEdit(false)}
            onUpdated={() => refetch()}
          />
        )}
        {showAccounts && (
          <ManageAccountsModal
            client={client}
            onClose={() => setShowAccounts(false)}
            onUpdated={() => refetch()}
          />
        )}
      </div>
    </DashboardShell>
  );
}
