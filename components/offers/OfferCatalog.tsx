"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { OfferCard } from "./OfferCard";
import type { PortalOffer } from "@/lib/portalOffers";
import type { OfferPageSettings } from "@/lib/portalOfferRules";

/** Portal catalog grid with category filter chips (shown only with 2+ categories). */
export function OfferCatalog({
  offers,
  basePath,
  requestedIds,
  labels,
}: {
  offers: PortalOffer[];
  basePath: string;
  requestedIds: string[];
  labels: Pick<OfferPageSettings, "learnMoreLabel" | "allFilterLabel" | "requestedBadge">;
}) {
  const [category, setCategory] = useState<string | null>(null);
  const categories = useMemo(
    () => Array.from(new Set(offers.map((o) => o.category).filter(Boolean))),
    [offers]
  );
  const requested = useMemo(() => new Set(requestedIds), [requestedIds]);
  const shown = category ? offers.filter((o) => o.category === category) : offers;

  return (
    <div className="space-y-5">
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          {[null, ...categories].map((c) => (
            <button
              key={c ?? "all"}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
                category === c
                  ? "bg-primary text-white shadow-sm"
                  : "bg-portal-surface-lowest text-portal-secondary-text shadow-sm hover:text-primary"
              )}
            >
              {c ?? labels.allFilterLabel}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((o) => (
          <OfferCard
            key={o.id}
            offer={o}
            href={`${basePath}/${o.slug}`}
            requestedLabel={requested.has(o.id) ? labels.requestedBadge : null}
            learnMoreLabel={labels.learnMoreLabel}
          />
        ))}
      </div>
    </div>
  );
}
