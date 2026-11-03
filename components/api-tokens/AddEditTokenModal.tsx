"use client";

import { useState, useEffect, useMemo, useId } from "react";
import { Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScopeSelector } from "./ScopeSelector";
import { workspacesToSend } from "./workspaceSelection";
import type { ApiTokenPublic, ResourceOption, WorkspaceOption } from "./types";
import type { AccessLevel, ResourceKey, TokenScopes } from "@/lib/apiScopes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface TokenFormData {
  id?: string;
  name: string;
  scopes: TokenScopes;
  clientIds: string[] | null;
  closerIds: string[] | null;
  /** Workspace (book) restriction — null = all workspaces; undefined (edit
   *  only) = unchanged, left out of the PATCH. */
  workspaces?: string[] | null;
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
  const uid = useId();
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
    <div className="grid min-w-0 gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={`${uid}-search`}>{label}</Label>
        <Badge variant="outline" tone={restricted ? "warning" : "neutral"}>
          {restricted ? `${selected.length} selected` : "All allowed"}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <div className="overflow-hidden rounded-2xl border">
        <div className="flex items-center gap-2 border-b px-3 py-1.5">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            id={`${uid}-search`}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="h-7 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {restricted && (
            <Button type="button" variant="ghost" size="xs" onClick={() => onChange([])} className="shrink-0">
              Clear
            </Button>
          )}
        </div>
        <div className="max-h-36 overflow-y-auto overscroll-contain p-1">
          {filtered.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">No matches</p>
          ) : (
            filtered.map((opt) => {
              const id = `${uid}-${opt.id}`;
              const checked = selected.includes(opt.id);
              return (
                <label
                  key={opt.id}
                  htmlFor={id}
                  className={cn(
                    // `relative` anchors the Checkbox's hidden form input.
                    "relative flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-sm transition-colors",
                    checked ? "bg-muted" : "hover:bg-muted/50"
                  )}
                >
                  <Checkbox id={id} checked={checked} onCheckedChange={() => toggle(opt.id)} />
                  <span className="min-w-0 truncate">{opt.name}</span>
                  {opt.role && (
                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{opt.role}</span>
                  )}
                </label>
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
  const uid = useId();

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

  // Books this token is restricted to that are no longer in the registry
  // (deleted before deletes were blocked for restricted tokens). Shown as
  // chips so the restriction stays visible and can be cleared (and re-ticked
  // until saved). Only once the registry has loaded — it always holds main.
  const unknownWorkspaces =
    workspaces.length > 0
      ? (token?.workspaces ?? []).filter((v) => !workspaces.some((w) => w.value === v))
      : [];
  const workspaceChips: WorkspaceOption[] = [
    ...workspaces,
    ...unknownWorkspaces.map((v) => ({ value: v, label: `${v} (deleted)` })),
  ];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      id: token?.id,
      name: name.trim(),
      scopes,
      clientIds: clientIds.length > 0 ? clientIds : null,
      closerIds: closerIds.length > 0 ? closerIds : null,
      workspaces: workspacesToSend(tokenWorkspaces, token),
      expiresAt: expiresAt || null,
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 pr-14">
          <DialogTitle>{isEdit ? "Edit API Token" : "Create API Token"}</DialogTitle>
          <DialogDescription>
            Scoped bearer token for the external REST API and MCP server.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-6 pb-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid content-start gap-2">
                <Label htmlFor={`${uid}-name`}>Token Name</Label>
                <Input
                  id={`${uid}-name`}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. reporting-agent"
                  required
                />
                <p className="text-xs text-muted-foreground break-all">
                  Shown in the audit log as <code className="font-mono">api:{name.trim() || "name"}</code>.
                </p>
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor={`${uid}-expires`}>Expires</Label>
                <DatePicker
                  id={`${uid}-expires`}
                  value={expiresAt}
                  onValueChange={setExpiresAt}
                  placeholder="No expiry"
                />
                <p className="text-xs text-muted-foreground">Leave empty for no expiry.</p>
              </div>
            </div>

            <fieldset className="grid min-w-0 gap-2">
              <legend className="mb-2 text-sm font-medium leading-none">Scopes</legend>
              <p className="text-xs text-muted-foreground">
                Each resource is granted at read, write, or delete level — delete implies write implies read.
              </p>
              <ScopeSelector scopes={scopes} onChange={handleScopeChange} />
            </fieldset>

            {/* Workspace (book) restriction — only offered once partner
                workspaces exist. None selected = all workspaces (the exact
                behavior every existing token has). Enforced by translating the
                restriction into the client_ids machinery at auth time — no
                endpoint behaves differently for unrestricted tokens. */}
            {(workspaces.length > 1 || unknownWorkspaces.length > 0) && (
              <fieldset className="grid min-w-0 gap-2">
                <legend className="mb-2 text-sm font-medium leading-none">Workspace access</legend>
                <p className="text-xs text-muted-foreground">
                  Restrict this token to specific workspaces (books) — it will only
                  see those books&apos; clients, ad accounts, billing and documents.
                  None selected = all workspaces.
                </p>
                <div className="flex flex-wrap gap-2">
                  {workspaceChips.map((w) => {
                    const checked = tokenWorkspaces.includes(w.value);
                    return (
                      <Button
                        key={w.value}
                        type="button"
                        size="sm"
                        variant={checked ? "default" : "outline"}
                        aria-pressed={checked}
                        onClick={() =>
                          setTokenWorkspaces((prev) =>
                            checked ? prev.filter((v) => v !== w.value) : [...prev, w.value]
                          )
                        }
                      >
                        {checked && <Check />}
                        {w.label}
                      </Button>
                    );
                  })}
                </div>
              </fieldset>
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
          </div>

          <DialogFooter className="shrink-0 border-t px-6 py-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name.trim() || !hasScopes}>
              {isPending ? "Saving..." : isEdit ? "Save Changes" : "Create Token"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
