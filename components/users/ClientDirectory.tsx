"use client";

import { useState, useMemo, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { AvatarInitials } from "./AvatarInitials";
import { StatusBadge } from "./StatusBadge";
import { ClientActionsMenu } from "./ClientActionsMenu";
import { ManageAccountsModal } from "./ManageAccountsModal";
import { EditClientModal } from "./EditClientModal";
import { MrrDetailModal } from "./MrrDetailModal";
import { RebillStatusChip } from "./RebillStatusChip";
import { formatMoney, formatDate } from "./format";
import { updateUserAction, deleteUserAction } from "@/app/actions/users";
import type { ClientPublic } from "./types";
import type { UserStatus } from "@/lib/users";

const PAGE_SIZE = 20;

interface ClientDirectoryProps {
  clients: ClientPublic[];
  onRefresh: () => void;
}

export function ClientDirectory({ clients, onRefresh }: ClientDirectoryProps) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [managingId, setManagingId] = useState<string | null>(null);
  const [mrrClientId, setMrrClientId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Reset to page 1 when the (externally-filtered) list changes, so applying a
  // filter doesn't strand the user on a now-out-of-range page.
  useEffect(() => setPage(1), [clients]);

  const editingClient = editingId ? clients.find((c) => c.id === editingId) ?? null : null;
  const managingClient = managingId ? clients.find((c) => c.id === managingId) ?? null : null;
  const mrrClient = mrrClientId ? clients.find((c) => c.id === mrrClientId) ?? null : null;

  const totalPages = Math.max(1, Math.ceil(clients.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = useMemo(
    () => clients.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [clients, currentPage]
  );

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

  return (
    <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card overflow-hidden">
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-muted/30 dark:bg-white/[0.03] border-b border-border/50">
              <Th className="pl-4">Client</Th>
              <Th>Status</Th>
              <Th>Date Joined</Th>
              <Th className="text-right">Monthly MRR</Th>
              <Th>Last Re-bill</Th>
              <Th>Next Re-bill</Th>
              <Th className="text-center">Accounts</Th>
              <Th className="text-right pr-4">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No clients match your filters.
                </td>
              </tr>
            ) : (
              paginated.map((client) => (
                <tr
                  key={client.id}
                  className="border-b border-border/50 dark:border-white/[0.06] hover:bg-muted/20 transition-colors"
                >
                  <td className="px-4 py-3">
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
                  <td className="px-4 py-3">
                    <StatusBadge status={client.status} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-foreground">{formatDate(client.joinedAt)}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {client.payoutMrr > 0 ? (
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
                  <td className="px-4 py-3">
                    <span className="text-sm text-muted-foreground">
                      {formatDate(client.schedule.lastRebilledAt)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <RebillStatusChip status={client.schedule.status} paid={client.schedule.paid} />
                      {client.schedule.nextRebillAt && (
                        <span className="text-xs text-muted-foreground">
                          {formatDate(client.schedule.nextRebillAt)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm font-medium text-foreground">
                      {client.accounts.length}
                    </span>
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
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden p-3 space-y-3">
        {paginated.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No clients match your filters.
          </p>
        ) : (
          paginated.map((client) => (
            <div
              key={client.id}
              className="rounded-xl border border-border/50 dark:border-white/[0.06] p-4"
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
                    </p>
                    <StatusBadge status={client.status} />
                  </div>
                </div>
                <ClientActionsMenu
                  client={client}
                  onEdit={() => setEditingId(client.id)}
                  onManageAccounts={() => setManagingId(client.id)}
                  onArchive={() => handleArchive(client)}
                  onDelete={() => handleDelete(client)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                <Field label="Joined" value={formatDate(client.joinedAt)} />
                <Field
                  label="Monthly MRR"
                  value={formatMoney(client.payoutMrr)}
                  onClick={
                    client.payoutMrr > 0 ? () => setMrrClientId(client.id) : undefined
                  }
                />
                <Field label="Last re-bill" value={formatDate(client.schedule.lastRebilledAt)} />
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase">
                    Next re-bill
                  </p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <RebillStatusChip status={client.schedule.status} paid={client.schedule.paid} />
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
          <p className="text-xs font-medium text-muted-foreground">
            Showing {paginated.length} of {clients.length}
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

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider",
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
