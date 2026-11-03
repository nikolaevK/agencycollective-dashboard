"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, KeyRound, Plus } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { useAdmin } from "@/components/providers/AdminProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { QueryErrorState } from "@/components/shared/QueryErrorState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ui/use-confirm";
import type { TokenFormData } from "./AddEditTokenModal";
import { TokenCard } from "./TokenCard";
import type { ApiTokenPublic, ResourceOption, WorkspaceOption } from "./types";

// Lazy: click-to-open dialogs (Radix Dialog, date picker, checkboxes) stay
// out of the page's first load.
const AddEditTokenModal = dynamic(
  () => import("./AddEditTokenModal").then((m) => m.AddEditTokenModal),
  { ssr: false }
);
// The shown-once secret must never wait on a chunk download: every action
// that can reveal one (Create, Rotate) preloads it before its request.
const loadSecretReveal = () => import("./TokenSecretReveal");
const TokenSecretReveal = dynamic(() => loadSecretReveal().then((m) => m.TokenSecretReveal), {
  ssr: false,
});

async function fetchTokens(): Promise<ApiTokenPublic[]> {
  const res = await fetch("/api/admin/api-tokens");
  if (!res.ok) throw new Error("Failed to load tokens");
  const json = await res.json();
  return json.data ?? [];
}

async function fetchOptions(): Promise<{
  clients: ResourceOption[];
  closers: ResourceOption[];
  workspaces: WorkspaceOption[];
}> {
  const res = await fetch("/api/admin/api-tokens/options");
  if (!res.ok) return { clients: [], closers: [], workspaces: [] };
  const json = await res.json();
  return {
    clients: json.data?.clients ?? [],
    closers: json.data?.closers ?? [],
    workspaces: json.data?.workspaces ?? [],
  };
}

export function ApiTokensPanel() {
  const admin = useAdmin();
  const queryClient = useQueryClient();
  const { toastError } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [isPending, startTransition] = useTransition();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ApiTokenPublic | null>(null);
  const [revealed, setRevealed] = useState<{ name: string; secret: string } | null>(null);

  const { data: tokens = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["api-tokens"],
    queryFn: fetchTokens,
  });
  const { data: options = { clients: [], closers: [], workspaces: [] } } = useQuery({
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
            // null = all workspaces; the routes sanitize against the registry.
            workspaces: data.workspaces,
            expiresAt: data.expiresAt,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        toastError(json.error ?? "Failed to save token");
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

  async function handleRotate(token: ApiTokenPublic) {
    void loadSecretReveal();
    const ok = await confirm({
      title: `Rotate "${token.name}"?`,
      description:
        "The current secret stops working immediately; scopes and usage history are kept.",
      confirmText: "Rotate",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await fetch(`/api/admin/api-tokens/${token.id}/rotate`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        toastError(json.error ?? "Failed to rotate token");
        return;
      }
      invalidate();
      setRevealed({ name: token.name, secret: json.data.token });
    });
  }

  async function handleRevoke(token: ApiTokenPublic) {
    const ok = await confirm({
      title: `Revoke "${token.name}"?`,
      description: "Requests with this token will be rejected.",
      confirmText: "Revoke",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await fetch(`/api/admin/api-tokens/${token.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        toastError(json.error ?? "Failed to revoke token");
        return;
      }
      invalidate();
    });
  }

  async function handleDelete(token: ApiTokenPublic) {
    const ok = await confirm({
      title: `Permanently delete "${token.name}"?`,
      description: "This deletes the token and its usage history. This cannot be undone.",
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await fetch(`/api/admin/api-tokens/${token.id}?hard=1`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await res.json();
        toastError(json.error ?? "Failed to delete token");
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
          <div className="min-w-0">
            <h2 className="text-2xl lg:text-3xl font-semibold tracking-tight">API Tokens</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Scoped bearer tokens for the external REST API (<code className="font-mono">/api/v1</code>)
              and MCP server. {activeCount} active.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard/api-docs">
                <BookOpen />
                API Docs
              </Link>
            </Button>
            {canMutate && (
              <Button
                onClick={() => {
                  void loadSecretReveal();
                  setEditing(null);
                  setModalOpen(true);
                }}
              >
                <Plus />
                Create Token
              </Button>
            )}
          </div>
        </div>

        {!canMutate && (
          <Card className="px-4 py-3 text-sm text-muted-foreground">
            Managing tokens requires the API Tokens permission (granted on the Admins page).
          </Card>
        )}

        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="flex flex-col gap-3 p-4 md:p-5">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-3 w-32" />
                <div className="flex gap-1.5">
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <Skeleton className="h-3 w-64 max-w-full" />
              </Card>
            ))}
          </div>
        ) : isError ? (
          <QueryErrorState title="Couldn't load API tokens" onRetry={() => refetch()} />
        ) : tokens.length === 0 ? (
          <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <KeyRound className="size-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No API tokens yet</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Mint a scoped token to let an external agent or automation read
              and write Closers, Clients, Media Buyers, or SOPs data.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
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

      {modalOpen && (
        <AddEditTokenModal
          open={modalOpen}
          token={editing}
          clients={options.clients}
          closers={options.closers}
          workspaces={options.workspaces}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          onSave={handleSave}
          isPending={isPending}
        />
      )}

      {revealed !== null && (
        <TokenSecretReveal
          open={revealed !== null}
          tokenName={revealed?.name ?? ""}
          secret={revealed?.secret ?? ""}
          onClose={() => setRevealed(null)}
        />
      )}

      {confirmDialog}
    </DashboardShell>
  );
}
