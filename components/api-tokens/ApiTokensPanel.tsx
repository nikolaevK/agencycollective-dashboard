"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, KeyRound, Plus } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { useAdmin } from "@/components/providers/AdminProvider";
import { AddEditTokenModal, type TokenFormData } from "./AddEditTokenModal";
import { TokenCard } from "./TokenCard";
import { TokenSecretReveal } from "./TokenSecretReveal";
import type { ApiTokenPublic, ResourceOption } from "./types";

async function fetchTokens(): Promise<ApiTokenPublic[]> {
  const res = await fetch("/api/admin/api-tokens");
  if (!res.ok) throw new Error("Failed to load tokens");
  const json = await res.json();
  return json.data ?? [];
}

async function fetchOptions(): Promise<{
  clients: ResourceOption[];
  closers: ResourceOption[];
}> {
  const res = await fetch("/api/admin/api-tokens/options");
  if (!res.ok) return { clients: [], closers: [] };
  const json = await res.json();
  return {
    clients: json.data?.clients ?? [],
    closers: json.data?.closers ?? [],
  };
}

export function ApiTokensPanel() {
  const admin = useAdmin();
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ApiTokenPublic | null>(null);
  const [revealed, setRevealed] = useState<{ name: string; secret: string } | null>(null);

  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ["api-tokens"],
    queryFn: fetchTokens,
  });
  const { data: options = { clients: [], closers: [] } } = useQuery({
    queryKey: ["api-token-options"],
    queryFn: fetchOptions,
    staleTime: 60_000,
  });

  const canMutate = admin.isSuper || admin.permissions.apitokens;

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
  }

  function handleSave(data: TokenFormData) {
    startTransition(async () => {
      const isEdit = Boolean(data.id);
      const res = await fetch(
        isEdit ? `/api/admin/api-tokens/${data.id}` : "/api/admin/api-tokens",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data.name,
            scopes: data.scopes,
            clientIds: data.clientIds,
            closerIds: data.closerIds,
            expiresAt: data.expiresAt,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        alert(json.error ?? "Failed to save token");
        return;
      }
      setModalOpen(false);
      setEditing(null);
      invalidate();
      if (!isEdit && json.data?.token) {
        setRevealed({ name: data.name, secret: json.data.token });
      }
    });
  }

  function handleRotate(token: ApiTokenPublic) {
    if (
      !confirm(
        `Rotate "${token.name}"? The current secret stops working immediately; scopes and usage history are kept.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await fetch(`/api/admin/api-tokens/${token.id}/rotate`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error ?? "Failed to rotate token");
        return;
      }
      invalidate();
      setRevealed({ name: token.name, secret: json.data.token });
    });
  }

  function handleRevoke(token: ApiTokenPublic) {
    if (!confirm(`Revoke "${token.name}"? Requests with this token will be rejected.`)) return;
    startTransition(async () => {
      const res = await fetch(`/api/admin/api-tokens/${token.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error ?? "Failed to revoke token");
        return;
      }
      invalidate();
    });
  }

  function handleDelete(token: ApiTokenPublic) {
    if (
      !confirm(
        `Permanently delete "${token.name}" and its usage history? This cannot be undone.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await fetch(`/api/admin/api-tokens/${token.id}?hard=1`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error ?? "Failed to delete token");
        return;
      }
      invalidate();
    });
  }

  const activeCount = tokens.filter((t) => !t.revokedAt).length;

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl lg:text-3xl font-black">API Tokens</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Scoped bearer tokens for the external REST API (<code className="font-mono">/api/v1</code>)
              and MCP server. {activeCount} active.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/api-docs"
              className="flex h-9 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              <BookOpen className="h-4 w-4" />
              API Docs
            </Link>
            {canMutate && (
              <button
                onClick={() => {
                  setEditing(null);
                  setModalOpen(true);
                }}
                className="ac-gradient flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                Create Token
              </button>
            )}
          </div>
        </div>

        {!canMutate && (
          <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            Managing tokens requires the API Tokens permission (granted on the Admins page).
          </p>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-muted/40" />
            ))}
          </div>
        ) : tokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
            <KeyRound className="h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No API tokens yet</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Mint a scoped token to let an external agent or automation read
              and write Closers, Clients, Media Buyers, or SOPs data.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {tokens.map((token) => (
              <TokenCard
                key={token.id}
                token={token}
                canMutate={canMutate}
                onEdit={(t) => {
                  setEditing(t);
                  setModalOpen(true);
                }}
                onRotate={handleRotate}
                onRevoke={handleRevoke}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      <AddEditTokenModal
        open={modalOpen}
        token={editing}
        clients={options.clients}
        closers={options.closers}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSave={handleSave}
        isPending={isPending}
      />

      <TokenSecretReveal
        open={revealed !== null}
        tokenName={revealed?.name ?? ""}
        secret={revealed?.secret ?? ""}
        onClose={() => setRevealed(null)}
      />
    </DashboardShell>
  );
}
