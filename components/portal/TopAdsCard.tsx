"use client";

import { ImageIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { MetaAdWithCreative } from "@/lib/meta/types";

interface TopAdsCardProps {
  ads?: MetaAdWithCreative[];
  isLoading?: boolean;
  currency?: string;
}

function getAdThumbnail(ad: MetaAdWithCreative): string | undefined {
  const c = ad.creative;
  if (!c) return undefined;

  const linkPic =
    c.object_story_spec?.link_data?.picture ??
    c.object_story_spec?.link_data?.image_url;
  if (linkPic) return linkPic;

  const videoPic =
    c.object_story_spec?.video_data?.image_url ??
    c.video_data?.thumbnail_url;
  if (videoPic) return videoPic;

  const photoImages = c.object_story_spec?.photo_data?.images;
  if (photoImages) {
    const first = Object.values(photoImages)[0]?.url;
    if (first) return first;
  }

  return c.image_url ?? c.thumbnail_url;
}

function getInsight(ad: MetaAdWithCreative) {
  const d = ad.insights?.data?.[0] as Record<string, number | undefined> | undefined;
  return {
    spend:       (d?.spend       ?? 0) as number,
    impressions: (d?.impressions ?? 0) as number,
    clicks:      (d?.clicks      ?? 0) as number,
    ctr:         (d?.ctr         ?? 0) as number,
    cpc:         (d?.cpc         ?? 0) as number,
  };
}

function fmt(value: number, currency: string, type: "currency" | "number" | "percent") {
  if (type === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  }
  if (type === "percent") return `${value.toFixed(2)}%`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:   "bg-green-500/15 text-green-600 dark:text-green-400",
  PAUSED:   "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  ARCHIVED: "bg-muted text-muted-foreground",
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground leading-none">
        {label}
      </span>
      <span className="text-xs font-semibold tabular-nums">{value}</span>
    </span>
  );
}

export function TopAdsCard({ ads, isLoading, currency = "USD" }: TopAdsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Top Ads by Spend</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="divide-y">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-start gap-4 p-4">
                <Skeleton className="h-20 w-20 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-2 pt-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-3 w-full mt-2" />
                </div>
                <Skeleton className="h-5 w-16 shrink-0" />
              </div>
            ))}
          </div>
        ) : !ads || ads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <ImageIcon className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">No ad data available for this period</p>
          </div>
        ) : (
          <ol className="divide-y">
            {ads.map((ad, idx) => {
              const thumb = getAdThumbnail(ad);
              const insight = getInsight(ad);
              const statusColor = STATUS_COLORS[ad.effective_status] ?? STATUS_COLORS.ARCHIVED;

              return (
                <li key={ad.id} className="flex items-start gap-3 p-4">
                  {/* Rank */}
                  <span className="shrink-0 w-5 pt-1 text-center text-sm font-semibold text-muted-foreground">
                    {idx + 1}
                  </span>

                  {/* Thumbnail */}
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border bg-muted">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt={ad.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-snug truncate">{ad.name}</p>
                    {ad.campaign?.name && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {ad.campaign.name}
                      </p>
                    )}

                    <span
                      className={cn(
                        "mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
                        statusColor
                      )}
                    >
                      {ad.effective_status.charAt(0) +
                        ad.effective_status.slice(1).toLowerCase()}
                    </span>

                    <div className="mt-2 flex items-center gap-3 flex-wrap">
                      <Stat label="Impr" value={fmt(insight.impressions, currency, "number")} />
                      <Stat label="Clicks" value={fmt(insight.clicks, currency, "number")} />
                      <Stat label="CTR" value={fmt(insight.ctr, currency, "percent")} />
                      <Stat label="CPC" value={fmt(insight.cpc, currency, "currency")} />
                    </div>
                  </div>

                  {/* Spend */}
                  <p className="shrink-0 pt-0.5 text-sm font-bold tabular-nums">
                    {fmt(insight.spend, currency, "currency")}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
