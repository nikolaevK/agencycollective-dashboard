"use client";

import { memo, useMemo, useState } from "react";
import { Check, ImageIcon, Video } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AdCopyCreative } from "@/lib/adCopy/types";

interface CreativeGridProps {
  creatives: AdCopyCreative[];
  selectedIds: Set<string>;
  onToggle: (adId: string) => void;
  /** Select the first `maxSelection` creatives in the CURRENT sort order. */
  onSelectMany: (adIds: string[]) => void;
  onClearAll: () => void;
  maxSelection?: number;
}

type SortKey = "spend" | "ctr" | "name";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "spend", label: "Top spend" },
  { value: "ctr", label: "Top CTR" },
  { value: "name", label: "Name" },
];

/** Memoized: up to 200 cards, and the generator re-renders while copy streams in. */
export const CreativeGrid = memo(function CreativeGrid({
  creatives,
  selectedIds,
  onToggle,
  onSelectMany,
  onClearAll,
  maxSelection = 10,
}: CreativeGridProps) {
  const [sort, setSort] = useState<SortKey>("spend");
  const atLimit = selectedIds.size >= maxSelection;

  const sorted = useMemo(() => {
    const list = [...creatives];
    if (sort === "spend") list.sort((a, b) => b.spend - a.spend);
    else if (sort === "ctr") list.sort((a, b) => b.ctr - a.ctr);
    else list.sort((a, b) => a.adName.localeCompare(b.adName));
    return list;
  }, [creatives, sort]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">{selectedIds.size}</span> of {creatives.length} selected
          {atLimit && <span> · max {maxSelection}</span>}
        </p>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="h-8 w-auto min-w-[7.5rem] text-xs" aria-label="Sort creatives">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onSelectMany(sorted.slice(0, maxSelection).map((c) => c.adId))}
        >
          Select top {Math.min(maxSelection, creatives.length)}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClearAll} disabled={selectedIds.size === 0}>
          Clear
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {sorted.map((c) => {
          const isSelected = selectedIds.has(c.adId);
          const isDisabled = !isSelected && atLimit;
          const image = c.imageUrl ?? c.thumbnailUrl;
          return (
            <button
              key={c.adId}
              type="button"
              onClick={() => onToggle(c.adId)}
              disabled={isDisabled}
              aria-pressed={isSelected}
              aria-label={`${c.adName}, ${formatCurrency(c.spend)} spend, ${c.ctr.toFixed(2)}% CTR`}
              className={cn(
                "group flex flex-col overflow-hidden rounded-2xl bg-card text-left ring-1 ring-foreground/10 outline-none transition-all focus-visible:ring-[3px] focus-visible:ring-ring/40",
                isSelected ? "ring-2 ring-foreground" : "hover:ring-foreground/25",
                isDisabled && "cursor-not-allowed opacity-50"
              )}
            >
              <span className="relative block aspect-square w-full bg-muted">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image} alt="" loading="lazy" className="size-full object-cover" />
                ) : (
                  <span className="flex size-full items-center justify-center">
                    <ImageIcon className="size-6 text-muted-foreground/50" aria-hidden />
                  </span>
                )}
                <span
                  className={cn(
                    "absolute right-2 top-2 flex size-5 items-center justify-center rounded-md ring-1 transition-colors",
                    isSelected
                      ? "bg-primary text-primary-foreground ring-primary"
                      : "bg-background/80 text-transparent ring-foreground/20 backdrop-blur-sm"
                  )}
                  aria-hidden
                >
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
                {c.isVideo && (
                  <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-background/85 px-1.5 py-0.5 text-[10px] font-medium backdrop-blur-sm">
                    <Video className="size-3" aria-hidden />
                    Video
                  </span>
                )}
              </span>
              <span className="block space-y-0.5 px-2.5 py-2">
                <span className="block truncate text-xs font-medium" title={c.adName}>
                  {c.adName}
                </span>
                <span className="block text-[11px] tabular-nums text-muted-foreground">
                  {formatCurrency(c.spend)} · {c.ctr.toFixed(2)}% CTR
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
});
