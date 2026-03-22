"use client";

import { useState, useMemo, useTransition } from "react";
import { X, Plus, Trash2, ToggleLeft, ToggleRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAccounts } from "@/hooks/useAccounts";
import { useDateRange } from "@/hooks/useDateRange";
import { addClientAccountAction, removeClientAccountAction, toggleClientAccountAction } from "@/app/actions/clientAccounts";
import type { ClientPublic } from "./types";
import type { ClientAccount } from "@/lib/clientAccounts";

interface ManageAccountsModalProps {
  client: ClientPublic;
  onClose: () => void;
  onUpdated: () => void;
}

export function ManageAccountsModal({ client, onClose, onUpdated }: ManageAccountsModalProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [manualAccountId, setManualAccountId] = useState("");
  const [manualLabel, setManualLabel] = useState("");

  const { dateRange } = useDateRange();
  const { data: metaAccounts, isLoading: metaLoading } = useAccounts(dateRange);

  // Pre-compute name lookup map to avoid O(n*m) in render
  const metaNameMap = useMemo(() => {
    if (!metaAccounts) return new Map<string, string>();
    return new Map(metaAccounts.map((a) => [a.id, a.name]));
  }, [metaAccounts]);

  // IDs already linked to this client
  const linkedIds = useMemo(
    () => new Set(client.accounts.map((a) => a.accountId)),
    [client.accounts]
  );

  // Available accounts (not yet linked) filtered by search
  const available = useMemo(() => {
    if (!metaAccounts) return [];
    const unlinked = metaAccounts.filter((a) => !linkedIds.has(a.id));
    if (!search.trim()) return unlinked;
    const q = search.toLowerCase();
    return unlinked.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q)
    );
  }, [metaAccounts, linkedIds, search]);

  function handleLink(accountId: string, label?: string) {
    setError(null);
    startTransition(async () => {
      const result = await addClientAccountAction(client.id, accountId, label);
      if (result.error) {
        setError(result.error);
      } else {
        setSearch("");
        onUpdated();
      }
    });
  }

  function handleManualAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!manualAccountId.trim()) return;
    handleLink(manualAccountId.trim(), manualLabel.trim() || undefined);
    setManualAccountId("");
    setManualLabel("");
  }

  function handleRemove(account: ClientAccount) {
    setError(null);
    startTransition(async () => {
      const result = await removeClientAccountAction(client.id, account.accountId);
      if (result.error) {
        setError(result.error);
      } else {
        onUpdated();
      }
    });
  }

  function handleToggle(account: ClientAccount) {
    setError(null);
    startTransition(async () => {
      const result = await toggleClientAccountAction(client.id, account.accountId, !account.isActive);
      if (result.error) {
        setError(result.error);
      } else {
        onUpdated();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden animate-in fade-in-0 zoom-in-95 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border shrink-0">
          <div>
            <h3 className="text-lg font-bold text-foreground">Manage Accounts</h3>
            <p className="text-sm text-muted-foreground">{client.displayName}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted/50 rounded-lg transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Linked accounts */}
        <div className="p-6 space-y-3 overflow-y-auto flex-1 min-h-0">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            Linked Accounts ({client.accounts.length})
          </p>
          {client.accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No Meta accounts linked yet. Add one below.
            </p>
          ) : (
            client.accounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-muted/20"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {account.label || metaNameMap.get(account.accountId) || account.accountId}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    {account.accountId}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-3">
                  <button
                    onClick={() => handleToggle(account)}
                    disabled={isPending}
                    className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors"
                    title={account.isActive ? "Set inactive" : "Set active"}
                  >
                    {account.isActive ? (
                      <ToggleRight className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                    )}
                  </button>
                  <button
                    onClick={() => handleRemove(account)}
                    disabled={isPending}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
                    title="Remove account"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add account section */}
        <div className="p-6 border-t border-border shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              Add Account
            </p>
            <button
              onClick={() => setManualMode(!manualMode)}
              className="text-[10px] font-bold text-primary uppercase tracking-widest hover:underline"
            >
              {manualMode ? "Browse accounts" : "Enter ID manually"}
            </button>
          </div>

          {manualMode ? (
            /* Manual entry fallback */
            <form onSubmit={handleManualAdd} className="space-y-3">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={manualAccountId}
                  onChange={(e) => setManualAccountId(e.target.value)}
                  placeholder="act_123456789"
                  className="flex-1 bg-muted/40 dark:bg-white/5 border-2 border-transparent rounded-xl py-2.5 px-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-0 focus:outline-none transition-colors font-mono"
                />
                <input
                  type="text"
                  value={manualLabel}
                  onChange={(e) => setManualLabel(e.target.value)}
                  placeholder="Label (optional)"
                  className="w-36 bg-muted/40 dark:bg-white/5 border-2 border-transparent rounded-xl py-2.5 px-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-0 focus:outline-none transition-colors"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <button
                type="submit"
                disabled={isPending || !manualAccountId.trim()}
                className="w-full py-2.5 rounded-xl font-semibold text-sm text-white shadow-sm hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 ac-gradient"
              >
                <Plus className="h-4 w-4" />
                {isPending ? "Adding..." : "Add Account"}
              </button>
            </form>
          ) : (
            /* Searchable account picker */
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search accounts by name or ID..."
                  className="w-full pl-9 pr-4 py-2.5 bg-muted/40 dark:bg-white/5 border-2 border-transparent rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-0 focus:outline-none transition-colors"
                />
              </div>

              <div className="max-h-[200px] overflow-y-auto rounded-xl border border-border/50 divide-y divide-border/30">
                {metaLoading ? (
                  <div className="p-4 space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/60" />
                    ))}
                  </div>
                ) : available.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    {search
                      ? "No matching accounts found."
                      : metaAccounts && metaAccounts.length > 0
                        ? "All accounts are already linked."
                        : "No Meta accounts available."}
                  </p>
                ) : (
                  available.map((account) => (
                    <button
                      key={account.id}
                      onClick={() => handleLink(account.id, account.name)}
                      disabled={isPending}
                      className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/30 transition-colors disabled:opacity-50"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {account.name}
                        </p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-muted-foreground font-mono truncate">
                            {account.id}
                          </p>
                          <span className={cn(
                            "text-[9px] font-bold uppercase",
                            account.status === "ACTIVE"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-red-500 dark:text-red-400"
                          )}>
                            {account.status}
                          </span>
                        </div>
                      </div>
                      <Plus className="h-4 w-4 text-primary shrink-0 ml-2" />
                    </button>
                  ))
                )}
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
