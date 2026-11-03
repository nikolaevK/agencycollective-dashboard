"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { useConfirm } from "@/components/ui/use-confirm";

interface WorkspaceRegistryEntry {
  value: string;
  label: string;
  clientCount: number;
  adminCount: number;
  builtIn: boolean;
}

/**
 * Manage the workspace (book) registry — separate Client Directories for
 * outside teams. Privileged admins only (the /api/admin/admins/workspaces
 * routes enforce it). Rename keeps the slug; delete refuses while clients,
 * admins or live API tokens still use the book (move clients via each
 * client's Settings, unassign admins, edit or revoke the tokens).
 */
export function WorkspaceManagerModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [newLabel, setNewLabel] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Row whose Rename button gets focus back once its rename closes.
  const refocusRename = useRef<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const value = refocusRename.current;
    if (editing !== null || value === null) return;
    refocusRename.current = null;
    listRef.current
      ?.querySelector<HTMLButtonElement>(`[data-rename-for="${CSS.escape(value)}"]`)
      ?.focus();
  }, [editing]);

  function endRename(value: string) {
    refocusRename.current = value;
    setEditing(null);
  }

  const { data: registry = [], isLoading } = useQuery<WorkspaceRegistryEntry[]>({
    queryKey: ["workspace-registry"],
    queryFn: async () => {
      const res = await fetch("/api/admin/admins/workspaces");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return Array.isArray(json.data) ? json.data : [];
    },
    staleTime: 60_000,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["workspace-registry"] });
    queryClient.invalidateQueries({ queryKey: ["workspace-options"] });
  }

  async function request(input: RequestInfo, init?: RequestInit) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(input, init);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      invalidate();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd() {
    const label = newLabel.trim();
    if (!label) return;
    const ok = await request("/api/admin/admins/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    if (ok) setNewLabel("");
  }

  async function handleRename(value: string) {
    const label = editLabel.trim();
    if (!label) return;
    const ok = await request("/api/admin/admins/workspaces", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value, label }),
    });
    if (ok) endRename(value);
  }

  async function handleDelete(entry: WorkspaceRegistryEntry) {
    const ok = await confirm({
      title: `Remove workspace "${entry.label}"?`,
      description:
        "All clients must be moved out, all admins unassigned and any API tokens restricted to it edited or revoked first.",
      confirmText: "Remove",
      destructive: true,
    });
    if (!ok) return;
    await request(`/api/admin/admins/workspaces?value=${encodeURIComponent(entry.value)}`, {
      method: "DELETE",
    });
  }

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto overscroll-contain sm:max-w-lg"
          onEscapeKeyDown={(e) => {
            // Escape inside a rename row cancels the rename, not the dialog.
            if (editing === null) return;
            if (!(e.target instanceof Element) || !e.target.closest("[data-renaming]")) return;
            e.preventDefault();
            endRename(editing);
          }}
        >
          <DialogHeader className="pr-10">
            <DialogTitle>Workspaces</DialogTitle>
            <DialogDescription>
              Separate Client Directory / Team books for outside teams.
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="grid gap-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (
            <ul ref={listRef} className="grid gap-2">
              {registry.map((w) => (
                <li
                  key={w.value}
                  data-renaming={editing === w.value ? "" : undefined}
                  className="flex min-h-14 items-center gap-2 rounded-2xl border px-3 py-2"
                >
                  {editing === w.value ? (
                    <>
                      <Input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        aria-label={`Rename ${w.label}`}
                        className="flex-1"
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleRename(w.value)}
                        disabled={busy}
                        title="Save"
                        aria-label="Save name"
                      >
                        <Check />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                          <span className="truncate">{w.label}</span>
                          {w.builtIn && <Badge variant="secondary">main book</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {w.clientCount} client{w.clientCount === 1 ? "" : "s"} ·{" "}
                          {w.adminCount} admin{w.adminCount === 1 ? "" : "s"}
                        </p>
                      </div>
                      {!w.builtIn && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => {
                              setEditing(w.value);
                              setEditLabel(w.label);
                            }}
                            data-rename-for={w.value}
                            title="Rename"
                            aria-label={`Rename ${w.label}`}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleDelete(w)}
                            disabled={busy}
                            title="Remove"
                            aria-label={`Remove ${w.label}`}
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20"
                          >
                            <Trash2 />
                          </Button>
                        </>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-2">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="New workspace name (e.g. Team North)"
              aria-label="New workspace name"
              className="flex-1"
            />
            <Button onClick={handleAdd} disabled={busy || !newLabel.trim()}>
              <Plus />
              Add
            </Button>
          </div>

          {error && (
            <div role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Assign admins to a workspace in Add/Edit Admin. Clients are assigned
            on create (Add Client) or moved from their Settings tab. An admin
            whose workspaces don&apos;t include the main book is an external
            partner: they only see their book&apos;s clients, ad accounts,
            support threads and team members — the Payout DB, Welcome Kit and
            SOPs stay hidden.
          </p>
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  );
}
