"use client";

import { ImageIcon, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CampaignCreative } from "@/types/dashboard";

interface CreativeGridProps {
  creatives: CampaignCreative[];
  selectedIds: Set<string>;
  onToggle: (adId: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  maxSelection?: number;
}

export function CreativeGrid({
  creatives,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearAll,
  maxSelection = 10,
}: CreativeGridProps) {
  const atLimit = selectedIds.size >= maxSelection;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">
          {creatives.length} creative{creatives.length !== 1 ? "s" : ""} found
          {selectedIds.size > 0 && (
            <span className="ml-1 text-primary">
              ({selectedIds.size} selected)
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={onSelectAll}
            className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            Select all
          </button>
          <span className="text-muted-foreground/40">|</span>
          <button
            onClick={onClearAll}
            className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {atLimit && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Maximum {maxSelection} creatives can be selected for AI generation.
        </p>
      )}

      {/* Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
        {creatives.map((c) => {
          const isSelected = selectedIds.has(c.adId);
          const isDisabled = !isSelected && atLimit;

          return (
            <button
              key={c.adId}
              onClick={() => !isDisabled && onToggle(c.adId)}
              disabled={isDisabled}
              className={cn(
                "group relative aspect-square overflow-hidden rounded-lg border-2 transition-all",
                isSelected
                  ? "border-primary ring-1 ring-primary/30"
                  : "border-border hover:border-muted-foreground/40",
                isDisabled && "opacity-40 cursor-not-allowed"
              )}
            >
              {/* Image */}
              {c.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.imageUrl}
                  alt={c.adName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted">
                  <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
                </div>
              )}

              {/* Check overlay */}
              {isSelected && (
                <div className="absolute inset-0 bg-primary/20">
                  <div className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded bg-primary text-white">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </div>
                </div>
              )}

              {/* Hover overlay with name */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-[10px] text-white truncate leading-tight">
                  {c.adName}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
