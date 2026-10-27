"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowDown, ArrowUp, Pencil, Plus, Rocket, RotateCcw, Sparkles, Star, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { QueryErrorState } from "@/components/shared/QueryErrorState";
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

const LIFECYCLE_CHIP: Record<OfferLifecycle, { label: string; className: string }> = {
  live: { label: "Live", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  draft: { label: "Draft", className: "border-border bg-muted text-muted-foreground" },
  retired: { label: "Retired", className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
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
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm font-semibold transition-colors",
                filter === f.id
                  ? "border-transparent bg-foreground text-background"
                  : "border-border/60 text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label}{" "}
              <span className="opacity-60">
                {f.id === "all" ? rows.length : rows.filter((r) => offerLifecycle(r) === f.id).length}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white shadow-lg shadow-primary/20 ac-gradient hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          New service
        </button>
      </div>
      <p className="text-sm text-muted-foreground">
        Clients see Live services in this order (the featured one in the spotlight above them). Retire a service to
        take it down without losing its history; Restore brings it back as new.
      </p>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/60" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <Sparkles className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No services yet.</p>
          <button
            type="button"
            disabled={mutate.isPending}
            onClick={() => mutate.mutate(() => send("/api/admin/clients/offers", "POST", { starter: true }))}
            className="mt-3 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-muted/50 disabled:opacity-50"
          >
            Add the starter list ({STARTER_OFFERS.length} drafts to fill in)
          </button>
        </div>
      ) : shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nothing in this view.
        </p>
      ) : (
        <div className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/50 bg-card dark:border-white/[0.06]">
          {shown.map((o) => {
            const life = offerLifecycle(o);
            const index = shown.findIndex((r) => r.id === o.id);
            return (
              <div key={o.id} className={cn("flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap", !o.active && "bg-muted/20")}>
                <div className="flex flex-col">
                  <button
                    type="button"
                    disabled={index === 0 || mutate.isPending}
                    onClick={() => move(o.id, -1)}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    aria-label={`Move ${o.title} up`}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={index === shown.length - 1 || mutate.isPending}
                    onClick={() => move(o.id, 1)}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    aria-label={`Move ${o.title} down`}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <OfferLogo title={o.title} logoUrl={o.logoUrl} size="sm" className="w-24 max-w-[6rem]" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate font-semibold text-foreground">
                    {o.title}
                    {o.featured && (
                      // A featured draft/retired service takes the spotlight once it's live.
                      <span
                        role="img"
                        aria-label={o.active ? "Featured" : "Featured once live"}
                        title={o.active ? "Featured — the catalog spotlight" : "Featured — takes the spotlight once live"}
                        className="shrink-0"
                      >
                        <Star className={cn("h-3.5 w-3.5 text-amber-400", o.active && "fill-amber-400")} />
                      </span>
                    )}
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", LIFECYCLE_CHIP[life].className)}>
                      {LIFECYCLE_CHIP[life].label}
                    </span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[o.category, o.ctaType === "book_call" ? "Book a call" : "Request info", o.tagline]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>
                    <span className="font-semibold text-foreground">{o.stats.viewers}</span> clients ·{" "}
                    {o.stats.views} views · {o.stats.linkClicks} link clicks
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">{o.stats.openRequests}</span> open /{" "}
                    {o.stats.requests} requests
                  </p>
                </div>
                <button
                  type="button"
                  disabled={mutate.isPending}
                  onClick={() => setLive(o, !o.active)}
                  className="inline-flex w-28 items-center justify-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold text-foreground transition-colors hover:bg-muted/50 disabled:opacity-50"
                  title={
                    life === "live"
                      ? "Take it down — history and leads are kept"
                      : "Show it in every client's portal"
                  }
                >
                  {life === "live" ? (
                    <Archive className="h-3.5 w-3.5" />
                  ) : life === "retired" ? (
                    <RotateCcw className="h-3.5 w-3.5" />
                  ) : (
                    <Rocket className="h-3.5 w-3.5" />
                  )}
                  {life === "live" ? "Retire" : life === "retired" ? "Restore" : "Publish"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(o)}
                  className="rounded-lg p-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  aria-label={`Edit ${o.title}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={mutate.isPending}
                  onClick={() => {
                    if (confirm(`Delete ${o.title} for good? Its view counts go with it; past requests stay in the inbox. Retire it instead to keep its history.`)) {
                      mutate.mutate(() => send(`/api/admin/clients/offers/${o.id}`, "DELETE"));
                    }
                  }}
                  className="rounded-lg p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                  aria-label={`Delete ${o.title}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
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
    </div>
  );
}
