"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Plus, Pencil, Trash2, Check } from "lucide-react";

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
 * routes enforce it). Rename keeps the slug; delete refuses while clients are
 * still assigned (move them first via each client's Settings).
 */
export function WorkspaceManagerModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [newLabel, setNewLabel] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    if (ok) setEditing(null);
  }

  async function handleDelete(entry: WorkspaceRegistryEntry) {
    if (
      !confirm(
        `Remove workspace "${entry.label}"? All clients must be moved out and all admins unassigned first.`
      )
    )
      return;
    await request(`/api/admin/admins/workspaces?value=${encodeURIComponent(entry.value)}`, {
      method: "DELETE",
    });
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative mt-16 w-full max-w-lg rounded-2xl bg-card shadow-xl border border-border/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-border/50">
          <div>
            <h2 className="text-lg font-bold text-foreground">Workspaces</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Separate Client Directory / Team books for outside teams.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <ul className="space-y-2">
              {registry.map((w) => (
                <li
                  key={w.value}
                  className="flex items-center gap-3 rounded-xl border border-border/50 px-3 py-2.5"
                >
                  {editing === w.value ? (
                    <>
                      <input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="flex-1 rounded-lg bg-muted/40 dark:bg-white/5 px-2.5 py-1.5 text-sm text-foreground focus:outline-none"
                        autoFocus
                      />
                      <button
                        onClick={() => handleRename(w.value)}
                        disabled={busy}
                        className="p-1.5 rounded-lg hover:bg-muted text-emerald-600"
                        title="Save"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {w.label}
                          {w.builtIn && (
                            <span className="ml-2 text-[11px] font-medium text-muted-foreground">
                              main book
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {w.clientCount} client{w.clientCount === 1 ? "" : "s"} ·{" "}
                          {w.adminCount} admin{w.adminCount === 1 ? "" : "s"}
                        </p>
                      </div>
                      {!w.builtIn && (
                        <>
                          <button
                            onClick={() => {
                              setEditing(w.value);
                              setEditLabel(w.label);
                            }}
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
                            title="Rename"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(w)}
                            disabled={busy}
                            className="p-1.5 rounded-lg hover:bg-muted text-destructive"
                            title="Remove"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-2">
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="New workspace name (e.g. Team North)"
              className="flex-1 rounded-xl bg-muted/40 dark:bg-white/5 border-2 border-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            <button
              onClick={handleAdd}
              disabled={busy || !newLabel.trim()}
              className="flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-bold text-white ac-gradient hover:opacity-90 disabled:opacity-40 transition-all"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            Assign admins to a workspace in Add/Edit Admin. Clients are assigned
            on create (Add Client) or moved from their Settings tab. An admin
            whose workspaces don&apos;t include the main book is an external
            partner: they only see their book&apos;s clients, ad accounts,
            support threads and team members — the Payout DB, Welcome Kit and
            SOPs stay hidden.
          </p>
        </div>
      </div>
    </div>
  );
}
