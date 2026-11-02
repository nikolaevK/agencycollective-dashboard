"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowDown, ArrowUp, Pencil, Plus, Rocket, RotateCcw, Sparkles, Star, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { QueryErrorState } from "@/components/shared/QueryErrorState";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useConfirm } from "@/components/ui/use-confirm";
import { OfferLogo } from "../OfferVisuals";
import { OfferEditorDialog } from "./OfferEditorDialog";
import { useOfferPage } from "./useOfferPage";
import { STARTER_OFFERS, offerLifecycle, type OfferLifecycle } from "@/lib/portalOfferRules";
import type { OfferStats, PortalOffer } from "@/lib/portalOffers";

export type CatalogRow = PortalOffer & { stats: OfferStats };

export const CATALOG_KEY = ["admin-offer-catalog"];


const FILTERS: { id: OfferLifecycle | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
  { id: "draft", label: "Drafts" },
  { id: "retired", label: "Retired" },
];

const LIFECYCLE_CHIP: Record<OfferLifecycle, { label: string; tone: BadgeTone }> = {
  live: { label: "Live", tone: "success" },
  draft: { label: "Draft", tone: "neutral" },
  retired: { label: "Retired", tone: "warning" },
};

export async function fetchCatalog(): Promise<CatalogRow[]> {
  const res = await fetch("/api/admin/clients/offers");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).data as CatalogRow[];
}

async function send(url: string, method: string, body?: unknown): Promise<void> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error(json?.error ?? `HTTP ${res.status}`);
  }
}

/** The portal cross-sell catalog: add, publish, retire, reorder, edit, engagement. */
export function OfferCatalogManager() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: CATALOG_KEY, queryFn: fetchCatalog });
  const { data: page } = useOfferPage();
  const [editing, setEditing] = useState<PortalOffer | "new" | null>(null);
  const [filter, setFilter] = useState<OfferLifecycle | "all">("all");
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const rows = data ?? [];
  const shown = filter === "all" ? rows : rows.filter((r) => offerLifecycle(r) === filter);
  const categories = Array.from(new Set(rows.map((r) => r.category).filter(Boolean)));

  const refresh = () => qc.invalidateQueries({ queryKey: CATALOG_KEY });
  const mutate = useMutation({
    mutationFn: (fn: () => Promise<void>) => fn(),
    onMutate: () => setError(null),
    onSettled: refresh,
    onError: (err) => setError(err instanceof Error ? err.message : "Update failed"),
  });
  const setLive = (o: PortalOffer, active: boolean) =>
    mutate.mutate(() => send(`/api/admin/clients/offers/${o.id}`, "PATCH", { active }));

  /** Swap with the neighbour VISIBLE in the current filter, keeping hidden rows in place. */
  function move(id: string, delta: -1 | 1) {
    const at = shown.findIndex((r) => r.id === id);
    const neighbour = shown[at + delta];
    if (at < 0 || !neighbour) return;
    const ids = rows.map((r) => r.id);
    const a = ids.indexOf(id);
    const b = ids.indexOf(neighbour.id);
    [ids[a], ids[b]] = [ids[b], ids[a]];
    qc.setQueryData<CatalogRow[]>(CATALOG_KEY, (old) => (old ? ids.map((x) => old.find((r) => r.id === x)!) : old));
    mutate.mutate(() => send("/api/admin/clients/offers/order", "PUT", { ids }));
  }

  if (isError) return <QueryErrorState title="Couldn't load the catalog" onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={filter}
          onValueChange={(v) => {
            if (v) setFilter(v as OfferLifecycle | "all");
          }}
          aria-label="Filter services"
          className="flex-wrap justify-start"
        >
          {FILTERS.map((f) => (
            <ToggleGroupItem key={f.id} value={f.id} className="px-3">
              {f.label}{" "}
              <span className="tabular-nums text-muted-foreground">
                {f.id === "all" ? rows.length : rows.filter((r) => offerLifecycle(r) === f.id).length}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Button type="button" onClick={() => setEditing("new")}>
          <Plus />
          New service
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Clients see Live services in this order (the featured one in the spotlight above them). Retire a service to
        take it down without losing its history; Restore brings it back as new.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="px-6 py-10 text-center">
          <Sparkles className="mx-auto mb-2 size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No services yet.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={mutate.isPending}
            onClick={() => mutate.mutate(() => send("/api/admin/clients/offers", "POST", { starter: true }))}
            className="mt-3"
          >
            Add the starter list ({STARTER_OFFERS.length} drafts to fill in)
          </Button>
        </Card>
      ) : shown.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Nothing in this view.</Card>
      ) : (
        <Card className="divide-y">
          {shown.map((o) => {
            const life = offerLifecycle(o);
            const index = shown.findIndex((r) => r.id === o.id);
            return (
              <div key={o.id} className={cn("flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap", !o.active && "bg-muted/30")}>
                <div className="flex flex-col">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    disabled={index === 0 || mutate.isPending}
                    onClick={() => move(o.id, -1)}
                    aria-label={`Move ${o.title} up`}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    disabled={index === shown.length - 1 || mutate.isPending}
                    onClick={() => move(o.id, 1)}
                    aria-label={`Move ${o.title} down`}
                  >
                    <ArrowDown />
                  </Button>
                </div>
                <OfferLogo title={o.title} logoUrl={o.logoUrl} size="sm" className="w-24 max-w-[6rem]" />
                <div className="min-w-0 flex-1">
                  {/* div, not p: the status badge renders a <div>. */}
                  <div className="flex items-center gap-2 truncate font-medium text-foreground">
                    {o.title}
                    {o.featured && (
                      // A featured draft/retired service takes the spotlight once it's live.
                      <span
                        role="img"
                        aria-label={o.active ? "Featured" : "Featured once live"}
                        title={o.active ? "Featured — the catalog spotlight" : "Featured — takes the spotlight once live"}
                        className="shrink-0"
                      >
                        <Star className={cn("size-3.5 text-amber-500", o.active && "fill-amber-500")} />
                      </span>
                    )}
                    <StatusBadge tone={LIFECYCLE_CHIP[life].tone}>{LIFECYCLE_CHIP[life].label}</StatusBadge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {[o.category, o.ctaType === "book_call" ? "Book a call" : "Request info", o.tagline]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="text-right text-xs tabular-nums text-muted-foreground">
                  <p>
                    <span className="font-medium text-foreground">{o.stats.viewers}</span> clients ·{" "}
                    {o.stats.views} views · {o.stats.linkClicks} link clicks
                  </p>
                  <p>
                    <span className="font-medium text-foreground">{o.stats.openRequests}</span> open /{" "}
                    {o.stats.requests} requests
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={mutate.isPending}
                  onClick={() => setLive(o, !o.active)}
                  className="w-28"
                  title={
                    life === "live"
                      ? "Take it down — history and leads are kept"
                      : "Show it in every client's portal"
                  }
                >
                  {life === "live" ? <Archive /> : life === "retired" ? <RotateCcw /> : <Rocket />}
                  {life === "live" ? "Retire" : life === "retired" ? "Restore" : "Publish"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setEditing(o)}
                  className="text-muted-foreground"
                  aria-label={`Edit ${o.title}`}
                >
                  <Pencil />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={mutate.isPending}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: `Delete ${o.title} for good?`,
                        description:
                          "Its view counts go with it; past requests stay in the inbox. Retire it instead to keep its history.",
                        confirmText: "Delete",
                        destructive: true,
                      })
                    ) {
                      mutate.mutate(() => send(`/api/admin/clients/offers/${o.id}`, "DELETE"));
                    }
                  }}
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Delete ${o.title}`}
                >
                  <Trash2 />
                </Button>
              </div>
            );
          })}
        </Card>
      )}

      {editing && (
        <OfferEditorDialog
          offer={editing === "new" ? null : editing}
          categories={categories}
          page={page?.settings}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
      {dialog}
    </div>
  );
}
