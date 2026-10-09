"use client";

import { useMemo, useState } from "react";
import { Clapperboard, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AssetMediaType } from "@/lib/clientAssetRules";
import { useAssetList, useAssetUploads, type AssetDto } from "@/hooks/useClientAssets";
import { AssetTile } from "./AssetTile";
import { AssetViewer } from "./AssetViewer";
import { UploadButton, UploadProgressList } from "./UploadControls";

const FILTERS: { value: AssetMediaType | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
  { value: "pdf", label: "PDFs" },
];

const PAGE_SIZE = 24;

/**
 * Ad Creatives grid — portal (read-only) and admin (`canUpload`). Pages of
 * 24 lazy thumbnails, keyset-paginated with "Load more"; the original bytes
 * are only fetched when someone opens or downloads one.
 */
export function CreativesGallery({ apiBase, canUpload }: { apiBase: string; canUpload: boolean }) {
  const [filter, setFilter] = useState<AssetMediaType | null>(null);
  const [open, setOpen] = useState<AssetDto | null>(null);
  const list = useAssetList(apiBase, "creative", { type: filter, limit: PAGE_SIZE });
  const uploads = useAssetUploads(apiBase, "creative");

  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const counts = list.data?.pages[0]?.counts ?? {};
  const total = (counts.image ?? 0) + (counts.video ?? 0) + (counts.pdf ?? 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:pb-0">
          {FILTERS.map((f) => {
            const n = f.value ? counts[f.value] ?? 0 : total;
            const active = filter === f.value;
            return (
              <button
                key={f.label}
                type="button"
                onClick={() => setFilter(f.value)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
                <span className="ml-1.5 opacity-60">{n}</span>
              </button>
            );
          })}
        </div>
        {canUpload && (
          <UploadButton
            category="creative"
            onFiles={uploads.upload}
            busy={uploads.busy}
            label="Upload creatives"
            className="w-full sm:w-auto"
          />
        )}
      </div>

      {canUpload && <UploadProgressList items={uploads.items} onDismiss={uploads.dismiss} />}

      {list.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[4/5] animate-pulse rounded-xl bg-muted/60" />
          ))}
        </div>
      ) : list.error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-600 dark:text-red-400">
          {list.error.message}
        </p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <Clapperboard className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">
            {filter ? "Nothing here with this filter" : "No creatives yet"}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            {canUpload
              ? "Upload images, videos (up to 100 MB) or PDFs. They appear in the client's portal right away."
              : "Every ad creative our team makes for you will show up here, ready to view and download."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
            {items.map((asset) => (
              <AssetTile key={asset.id} apiBase={apiBase} asset={asset} onOpen={() => setOpen(asset)} />
            ))}
          </div>
          {list.hasNextPage && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => list.fetchNextPage()}
                disabled={list.isFetchingNextPage}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted/50 disabled:opacity-60"
              >
                {list.isFetchingNextPage && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Load more
              </button>
            </div>
          )}
        </>
      )}

      <AssetViewer apiBase={apiBase} asset={open} onClose={() => setOpen(null)} />
    </div>
  );
}
