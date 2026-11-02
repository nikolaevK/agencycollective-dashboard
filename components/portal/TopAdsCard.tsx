"use client";

import { ImageIcon } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { metaStatusLabel, metaStatusTone } from "@/components/overview/metaStatus";
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-[11px] leading-none text-muted-foreground">{label}</span>
      <span className="text-xs font-medium tabular-nums">{value}</span>
    </span>
  );
}

export function TopAdsCard({ ads, isLoading, currency = "USD" }: TopAdsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Ads by Spend</CardTitle>
      </CardHeader>
      <CardContent className="p-0 md:p-0">
        {isLoading ? (
          <div className="divide-y border-t">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-start gap-4 p-4 md:px-6">
                <Skeleton className="h-20 w-20 shrink-0 rounded-2xl" />
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
          <div className="mx-4 mb-4 flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed py-10 text-muted-foreground md:mx-6 md:mb-6">
            <ImageIcon className="size-6" />
            <p className="text-sm">No ad data available for this period</p>
          </div>
        ) : (
          <ol className="divide-y border-t">
            {ads.map((ad, idx) => {
              const thumb = getAdThumbnail(ad);
              const insight = getInsight(ad);

              return (
                <li key={ad.id} className="flex items-start gap-3 p-4 md:px-6">
                  {/* Rank */}
                  <span className="shrink-0 w-5 pt-1 text-center text-sm font-medium tabular-nums text-muted-foreground">
                    {idx + 1}
                  </span>

                  {/* Thumbnail */}
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-muted ring-1 ring-foreground/5">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt={ad.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <ImageIcon className="size-6 text-muted-foreground/60" />
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

                    <StatusBadge tone={metaStatusTone(ad.effective_status)} className="mt-1.5">
                      {metaStatusLabel(ad.effective_status)}
                    </StatusBadge>

                    <div className="mt-2 flex items-center gap-3 flex-wrap">
                      <Stat label="Impr" value={fmt(insight.impressions, currency, "number")} />
                      <Stat label="Clicks" value={fmt(insight.clicks, currency, "number")} />
                      <Stat label="CTR" value={fmt(insight.ctr, currency, "percent")} />
                      <Stat label="CPC" value={fmt(insight.cpc, currency, "currency")} />
                    </div>
                  </div>

                  {/* Spend */}
                  <p className="shrink-0 pt-0.5 text-sm font-semibold tabular-nums">
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
