"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { AvatarInitials } from "./AvatarInitials";
import { StatusBadge } from "./StatusBadge";
import { ClientActionsMenu } from "./ClientActionsMenu";
import { ManageAccountsModal } from "./ManageAccountsModal";
import { EditClientModal } from "./EditClientModal";
import { updateUserAction, deleteUserAction } from "@/app/actions/users";
import type { ClientPublic } from "./types";
import type { UserStatus } from "@/lib/users";

type Tab = "all" | "active" | "archived";
const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "All Clients" },
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

const PAGE_SIZE = 10;

interface ClientDirectoryProps {
  clients: ClientPublic[];
  onRefresh: () => void;
}

function formatMrr(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function ClientDirectory({ clients, onRefresh }: ClientDirectoryProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [managingId, setManagingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Derive current client objects from fresh data so modals never show stale state
  const editingClient = editingId ? clients.find((c) => c.id === editingId) ?? null : null;
  const managingClient = managingId ? clients.find((c) => c.id === managingId) ?? null : null;

  const filtered = useMemo(() => {
    let result = clients;

    if (tab === "active") result = result.filter((c) => c.status === "active");
    else if (tab === "archived") result = result.filter((c) => c.status === "archived");

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.displayName.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.category?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [clients, tab, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const activeCount = clients.filter((c) => c.status === "active").length;

  function handleArchive(client: ClientPublic) {
    const newStatus: UserStatus = client.status === "archived" ? "active" : "archived";
    const formData = new FormData();
    formData.set("id", client.id);
    formData.set("status", newStatus);
    startTransition(async () => {
      await updateUserAction(formData);
      onRefresh();
    });
  }

  function handleDelete(client: ClientPublic) {
    if (!confirm(`Delete "${client.displayName}"? This cannot be undone.`)) return;
    startTransition(async () => {
      await deleteUserAction(client.id);
      onRefresh();
    });
  }

  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border/50 dark:border-white/[0.06] overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="p-5 lg:p-8 border-b border-border/50">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg lg:text-xl font-bold text-foreground">Client Directory</h3>
            <p className="text-sm text-muted-foreground">
              Managing {activeCount} active client{activeCount !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 bg-muted/40 dark:bg-white/5 p-1 rounded-xl">
            {TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => { setTab(t.value); setPage(1); }}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                  tab === t.value
                    ? "bg-card dark:bg-white/10 text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search clients..."
            className="w-full pl-9 pr-4 py-2 bg-muted/40 dark:bg-white/5 border-none rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all"
          />
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden lg:block overflow-x-auto flex-1">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-muted/30 dark:bg-white/[0.03]">
              <th className="px-8 py-3.5 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Client Name</th>
              <th className="px-6 py-3.5 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Status</th>
              <th className="px-6 py-3.5 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Accounts</th>
              <th className="px-6 py-3.5 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Monthly MRR</th>
              <th className="px-8 py-3.5 text-[11px] font-bold text-muted-foreground uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-8 py-12 text-center text-sm text-muted-foreground">
                  {search ? "No clients match your search." : "No clients yet. Create one using the form."}
                </td>
              </tr>
            ) : (
              paginated.map((client) => (
                <tr key={client.id} className="group hover:bg-muted/20 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="px-8 py-4">
                    <div
                      className="flex items-center gap-3 cursor-pointer"
                      onClick={() => router.push(`/dashboard/users/${client.id}`)}
                    >
                      <AvatarInitials name={client.displayName} />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground truncate hover:text-primary transition-colors">
                          {client.displayName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {client.category || client.email || "—"}
                        </p>
                      </div>
                      {!client.email && (
                        <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded text-[9px] font-bold uppercase shrink-0">
                          No email
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={client.status} />
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-foreground">
                      {client.accounts.length}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">
                      {client.accounts.length === 1 ? "account" : "accounts"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-semibold text-foreground">
                      {formatMrr(client.mrr)}
                    </span>
                  </td>
                  <td className="px-8 py-4 text-right">
                    <ClientActionsMenu
                      client={client}
                      onEdit={() => setEditingId(client.id)}
                      onManageAccounts={() => setManagingId(client.id)}
                      onArchive={() => handleArchive(client)}
                      onDelete={() => handleDelete(client)}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="lg:hidden p-4 space-y-3">
        {paginated.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {search ? "No clients match your search." : "No clients yet."}
          </p>
        ) : (
          paginated.map((client) => (
            <div
              key={client.id}
              className="flex items-center justify-between p-4 bg-muted/20 dark:bg-white/[0.03] rounded-xl border border-border/30"
            >
              <div className="flex items-center gap-3 min-w-0">
                <AvatarInitials name={client.displayName} className="w-12 h-12" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">
                    {client.displayName}
                  </p>
                  <StatusBadge status={client.status} />
                </div>
              </div>
              <div className="text-right shrink-0 ml-3 flex items-center gap-2">
                <div>
                  <p className="text-sm font-bold text-foreground">{formatMrr(client.mrr)}</p>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase">MRR</p>
                </div>
                <ClientActionsMenu
                  client={client}
                  onEdit={() => setEditingId(client.id)}
                  onManageAccounts={() => setManagingId(client.id)}
                  onArchive={() => handleArchive(client)}
                  onDelete={() => handleDelete(client)}
                />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 lg:px-8 py-4 border-t border-border/30">
          <p className="text-xs font-medium text-muted-foreground">
            Showing {paginated.length} of {filtered.length} clients
          </p>
          <div className="flex gap-1.5">
            <button
              onClick={() => setPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-border/50 text-sm hover:bg-muted/50 disabled:opacity-30 transition-colors"
            >
              &lsaquo;
            </button>
            {(() => {
              // Sliding window centered on currentPage
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
                      "w-9 h-9 flex items-center justify-center rounded-lg text-sm font-semibold transition-colors",
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
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-border/50 text-sm hover:bg-muted/50 disabled:opacity-30 transition-colors"
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
    </div>
  );
}
