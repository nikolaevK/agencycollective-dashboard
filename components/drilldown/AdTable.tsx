"use client";

import { ExternalLink } from "lucide-react";
import { MetaEntityTable } from "@/components/drilldown/MetaEntityTable";
import type { AdRow } from "@/types/dashboard";

interface AdTableProps {
  ads?: AdRow[];
  isLoading?: boolean;
  /** The ad account's currency. */
  currency?: string;
}

export function AdTable({ ads, isLoading, currency }: AdTableProps) {
  return (
    <MetaEntityTable
      rows={ads}
      isLoading={isLoading}
      currency={currency}
      nameLabel="Ad"
      emptyText="No ads found"
      subtitle={(ad) => (ad.creativeId ? `#${ad.creativeId}` : null)}
      action={(ad) =>
        ad.previewUrl ? (
          <a
            href={ad.previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded-full p-1 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30"
            aria-label={`Preview ${ad.name}`}
          >
            <ExternalLink className="size-4" />
          </a>
        ) : null
      }
    />
  );
}
