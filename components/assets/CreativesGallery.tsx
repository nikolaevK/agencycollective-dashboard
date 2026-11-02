"use client";

import { useMemo, useState } from "react";
import { Clapperboard, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { badgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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

/** ToggleGroup value for the "All" filter (Radix items need a string). */
const ALL = "all";

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
        <div className="-mx-1 overflow-x-auto px-1 pb-1 sm:pb-0">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={filter ?? ALL}
            onValueChange={(v) => {
              if (v) setFilter(v === ALL ? null : (v as AssetMediaType));
            }}
          >
            {FILTERS.map((f) => {
              const n = f.value ? counts[f.value] ?? 0 : total;
              return (
                <ToggleGroupItem key={f.label} value={f.value ?? ALL} className="shrink-0 px-3">
                  {f.label}
                  <span className="ml-0.5 tabular-nums text-muted-foreground">{n}</span>
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
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
            <Skeleton key={i} className="aspect-[4/5]" />
          ))}
        </div>
      ) : list.error ? (
        <p className={cn("rounded-2xl border px-4 py-3 text-sm", badgeTone.danger)}>
          {list.error.message}
        </p>
      ) : items.length === 0 ? (
        <Card className="flex flex-col items-center px-6 py-12 text-center">
          <Clapperboard className="mb-3 size-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">
            {filter ? "Nothing here with this filter" : "No creatives yet"}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            {canUpload
              ? "Upload images, videos (up to 100 MB) or PDFs. They appear in the client's portal right away."
              : "Every ad creative our team makes for you will show up here, ready to view and download."}
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
            {items.map((asset) => (
              <AssetTile key={asset.id} apiBase={apiBase} asset={asset} onOpen={() => setOpen(asset)} />
            ))}
          </div>
          {list.hasNextPage && (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => list.fetchNextPage()}
                disabled={list.isFetchingNextPage}
              >
                {list.isFetchingNextPage && <Loader2 className="animate-spin" />}
                Load more
              </Button>
            </div>
          )}
        </>
      )}

      <AssetViewer apiBase={apiBase} asset={open} onClose={() => setOpen(null)} />
    </div>
  );
}
