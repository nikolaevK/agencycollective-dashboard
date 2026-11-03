"use client";

import { useState, useMemo, useTransition } from "react";
import { Plus, Trash2, Search } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        // The old modal had no Escape handler — it closes only via the X
        // button or a backdrop click.
        onEscapeKeyDown={(e) => e.preventDefault()}
        // Focus the dialog itself, not the first account's active switch —
        // a stray Space there would unlink it from the portal.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.focus();
        }}
        className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        {/* Header */}
        <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4 pr-14">
          <DialogTitle>Manage Accounts</DialogTitle>
          <DialogDescription>{client.displayName}</DialogDescription>
        </DialogHeader>

        {/* Linked accounts */}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-6">
          <p className="text-xs text-muted-foreground">
            Linked Accounts ({client.accounts.length})
          </p>
          {client.accounts.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No Meta accounts linked yet. Add one below.
            </p>
          ) : (
            client.accounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between rounded-2xl bg-muted/50 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {account.label || metaNameMap.get(account.accountId) || account.accountId}
                  </p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {account.accountId}
                  </p>
                </div>
                <div className="ml-3 flex shrink-0 items-center gap-2">
                  <Switch
                    checked={account.isActive}
                    onCheckedChange={() => handleToggle(account)}
                    disabled={isPending}
                    title={account.isActive ? "Set inactive" : "Set active"}
                    aria-label={account.isActive ? "Set inactive" : "Set active"}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleRemove(account)}
                    disabled={isPending}
                    title="Remove account"
                    aria-label="Remove account"
                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add account section */}
        <div className="shrink-0 space-y-3 border-t p-6">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Add Account
            </p>
            <Button
              variant="link"
              size="xs"
              onClick={() => setManualMode(!manualMode)}
              className="px-0"
            >
              {manualMode ? "Browse accounts" : "Enter ID manually"}
            </Button>
          </div>

          {manualMode ? (
            /* Manual entry fallback */
            <form onSubmit={handleManualAdd} className="space-y-3">
              <div className="flex gap-3">
                <Input
                  type="text"
                  value={manualAccountId}
                  onChange={(e) => setManualAccountId(e.target.value)}
                  placeholder="act_123456789"
                  aria-label="Ad account ID"
                  className="flex-1 font-mono"
                />
                <Input
                  type="text"
                  value={manualLabel}
                  onChange={(e) => setManualLabel(e.target.value)}
                  placeholder="Label (optional)"
                  aria-label="Label (optional)"
                  className="w-36"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                type="submit"
                disabled={isPending || !manualAccountId.trim()}
                className="w-full"
              >
                <Plus />
                {isPending ? "Adding..." : "Add Account"}
              </Button>
            </form>
          ) : (
            /* Searchable account picker */
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search accounts by name or ID..."
                  className="pl-9"
                />
              </div>

              <div className="max-h-[200px] divide-y overflow-y-auto rounded-2xl ring-1 ring-foreground/5">
                {metaLoading ? (
                  <div className="space-y-2 p-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-10" />
                    ))}
                  </div>
                ) : available.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
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
                      className="flex w-full items-center justify-between px-4 py-3 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 disabled:opacity-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {account.name}
                        </p>
                        <div className="flex items-center gap-2">
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            {account.id}
                          </p>
                          <StatusBadge tone={account.status === "ACTIVE" ? "success" : "danger"}>
                            {account.status}
                          </StatusBadge>
                        </div>
                      </div>
                      <Plus className="ml-2 size-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))
                )}
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
