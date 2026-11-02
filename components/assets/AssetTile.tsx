"use client";

import { FileText, Film, ImageIcon, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/clientAssetRules";
import { assetFileUrl, type AssetDto } from "@/hooks/useClientAssets";

/** Square-ish gallery tile: lazy WebP thumbnail, or a type icon when none. */
export function AssetTile({
  apiBase,
  asset,
  onOpen,
  aspect = "aspect-[4/5]",
  showTitle = true,
}: {
  apiBase: string;
  asset: AssetDto;
  onOpen: () => void;
  aspect?: string;
  showTitle?: boolean;
}) {
  const Icon = asset.mediaType === "video" ? Film : asset.mediaType === "pdf" ? FileText : ImageIcon;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group relative w-full overflow-hidden rounded-2xl bg-muted/50 text-left ring-1 ring-foreground/5 transition-shadow outline-none hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/30 dark:ring-foreground/10",
        aspect
      )}
      title={asset.title}
    >
      {asset.hasThumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={assetFileUrl(apiBase, asset.id, "thumb")}
          alt={asset.title}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-muted-foreground">
          <Icon className="size-6" />
          <span className="text-xs font-medium capitalize">
            {asset.mediaType === "pdf" ? "PDF" : asset.mediaType}
          </span>
        </div>
      )}
      {asset.mediaType === "video" && (
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium tabular-nums text-white backdrop-blur-sm">
          <Play className="size-2.5 fill-current" />
          {formatDuration(asset.durationMs) || "Video"}
        </span>
      )}
      {showTitle && (
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-2.5 pb-2 pt-8">
          <span className="block truncate text-xs font-medium text-white">{asset.title}</span>
        </span>
      )}
    </button>
  );
}
