"use client";

import { useState, useEffect, useMemo } from "react";
import { X, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScopeSelector } from "./ScopeSelector";
import type { ApiTokenPublic, ResourceOption, WorkspaceOption } from "./types";
import type { AccessLevel, ResourceKey, TokenScopes } from "@/lib/apiScopes";

export interface TokenFormData {
  id?: string;
  name: string;
  scopes: TokenScopes;
  clientIds: string[] | null;
  closerIds: string[] | null;
  /** Workspace (book) restriction — null = all workspaces. */
  workspaces: string[] | null;
  expiresAt: string | null;
}

interface AddEditTokenModalProps {
  open: boolean;
  token: ApiTokenPublic | null; // null = add mode
  clients: ResourceOption[];
  closers: ResourceOption[];
  workspaces: WorkspaceOption[];
  onClose: () => void;
  onSave: (data: TokenFormData) => void;
  isPending: boolean;
}

const INPUT_CLS =
  "flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow";

function ResourcePicker({
  label,
  hint,
  options,
  selected,
  onChange,
}: {
  label: string;
  hint: string;
  options: ResourceOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, search]);
  const restricted = selected.length > 0;

  function toggle(id: string) {
    onChange(
      selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-medium",
            restricted
              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
              : "bg-primary/10 text-primary"
          )}
        >
          {restricted ? `${selected.length} selected` : "All allowed"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <div className="rounded-lg border border-border">
        <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground"
          />
          {restricted && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>
        <div className="max-h-36 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">No matches</p>
          ) : (
            filtered.map((opt) => {
              const checked = selected.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggle(opt.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                    checked ? "bg-primary/10 text-foreground" : "hover:bg-accent"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                      checked ? "border-primary bg-primary" : "border-border"
                    )}
                  >
                    {checked && (
                      <svg viewBox="0 0 8 8" className="h-2 w-2 fill-none stroke-primary-foreground" strokeWidth="1.5">
                        <path d="M1 4l2 2 4-4" />
                      </svg>
                    )}
                  </span>
                  <span className="truncate">{opt.name}</span>
                  {opt.role && (
                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{opt.role}</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export function AddEditTokenModal({
  open,
  token,
  clients,
  closers,
  workspaces,
  onClose,
  onSave,
  isPending,
}: AddEditTokenModalProps) {
  const isEdit = token !== null;

  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<TokenScopes>({});
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [closerIds, setCloserIds] = useState<string[]>([]);
  const [tokenWorkspaces, setTokenWorkspaces] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState("");

  useEffect(() => {
    if (open) {
      if (token) {
        setName(token.name);
        setScopes({ ...token.scopes });
        setClientIds(token.clientIds ?? []);
        setCloserIds(token.closerIds ?? []);
        setTokenWorkspaces(token.workspaces ?? []);
        setExpiresAt(token.expiresAt ? token.expiresAt.slice(0, 10) : "");
      } else {
        setName("");
        setScopes({});
        setClientIds([]);
        setCloserIds([]);
        setTokenWorkspaces([]);
        setExpiresAt("");
      }
    }
  }, [open, token]);

  if (!open) return null;

  function handleScopeChange(key: ResourceKey, level: AccessLevel) {
    setScopes((prev) => {
      const next = { ...prev };
      if (level === "none") delete next[key];
      else next[key] = level;
      return next;
    });
  }

  const hasScopes = Object.keys(scopes).length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      id: token?.id,
      name: name.trim(),
      scopes,
      clientIds: clientIds.length > 0 ? clientIds : null,
      closerIds: closerIds.length > 0 ? closerIds : null,
      workspaces: tokenWorkspaces.length > 0 ? tokenWorkspaces : null,
      expiresAt: expiresAt || null,
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-6 py-4 rounded-t-2xl">
          <h2 className="text-lg font-semibold">{isEdit ? "Edit API Token" : "Create API Token"}</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Token Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. reporting-agent"
                required
                className={INPUT_CLS}
              />
              <p className="text-xs text-muted-foreground">
                Shown in the audit log as <code className="font-mono">api:{name.trim() || "name"}</code>.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Expires</label>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className={INPUT_CLS}
              />
              <p className="text-xs text-muted-foreground">Leave empty for no expiry.</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Scopes</label>
            <p className="text-xs text-muted-foreground">
              Each resource is granted at read, write, or delete level — delete implies write implies read.
            </p>
            <ScopeSelector scopes={scopes} onChange={handleScopeChange} />
          </div>

          {/* Workspace (book) restriction — only offered once partner
              workspaces exist. None selected = all workspaces (the exact
              behavior every existing token has). Enforced by translating the
              restriction into the client_ids machinery at auth time — no
              endpoint behaves differently for unrestricted tokens. */}
          {workspaces.length > 1 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Workspace access</label>
              <p className="text-xs text-muted-foreground">
                Restrict this token to specific workspaces (books) — it will only
                see those books&apos; clients, ad accounts, billing and documents.
                None selected = all workspaces.
              </p>
              <div className="flex flex-wrap gap-2">
                {workspaces.map((w) => {
                  const checked = tokenWorkspaces.includes(w.value);
                  return (
                    <button
                      key={w.value}
                      type="button"
                      onClick={() =>
                        setTokenWorkspaces((prev) =>
                          checked ? prev.filter((v) => v !== w.value) : [...prev, w.value]
                        )
                      }
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                        checked
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {w.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ResourcePicker
              label="Client access"
              hint="Restrict to specific clients. None selected = all clients."
              options={clients}
              selected={clientIds}
              onChange={setClientIds}
            />
            <ResourcePicker
              label="Closer access"
              hint="Restrict to specific closers/setters. None selected = all."
              options={closers}
              selected={closerIds}
              onChange={setCloserIds}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !name.trim() || !hasScopes}
              className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              {isPending ? "Saving..." : isEdit ? "Save Changes" : "Create Token"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
