"use client";

import { memo, useState } from "react";
import {
  Bookmark,
  ChevronRight,
  Globe,
  Heart,
  ImageIcon,
  MessageCircle,
  Monitor,
  MoreHorizontal,
  Send,
  Share2,
  Smartphone,
  ThumbsUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { charCount, displayDomain, placementById, truncateForFeed, type PlacementId } from "@/lib/adCopy/limits";
import type { CopyField, CopyVariant } from "@/lib/adCopy/types";
import { StatusBadge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export interface PreviewImageOption {
  key: string;
  label: string;
  src: string;
}

export interface AdPreviewProps {
  images: PreviewImageOption[];
  imageKey: string | null;
  onImageChange: (key: string) => void;
  primaryTexts: CopyVariant[];
  headlines: CopyVariant[];
  descriptions: CopyVariant[];
  selected: Record<CopyField, string | null>;
  onSelect: (field: CopyField, id: string) => void;
  pageName: string;
  websiteUrl: string;
}

type Device = "mobile" | "desktop";

function shortLabel(v: CopyVariant, i: number): string {
  const base = v.angle?.trim() || v.text.trim().replace(/\s+/g, " ");
  const text = base.length > 42 ? `${base.slice(0, 40)}…` : base;
  return `${i + 1}. ${text || "(empty)"}`;
}

function VariantSelect({
  label,
  field,
  list,
  value,
  onSelect,
}: {
  label: string;
  field: CopyField;
  list: CopyVariant[];
  value: string | null;
  onSelect: (field: CopyField, id: string) => void;
}) {
  if (list.length <= 1) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
      <Select value={value ?? undefined} onValueChange={(id) => onSelect(field, id)}>
        <SelectTrigger className="h-8 min-w-0 flex-1 text-xs" aria-label={`${label} variant`}>
          <SelectValue placeholder="Choose" />
        </SelectTrigger>
        <SelectContent>
          {list.map((v, i) => (
            <SelectItem key={v.id} value={v.id}>
              {shortLabel(v, i)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Avatar({ name, size = "size-9" }: { name: string; size?: string }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground ring-1 ring-foreground/10", size)}>
      {name.trim().charAt(0).toUpperCase() || "A"}
    </span>
  );
}

function CreativeImage({ src, className }: { src: string | null; className?: string }) {
  return (
    <div className={cn("w-full bg-muted", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="Ad creative" className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center">
          <ImageIcon className="size-10 text-muted-foreground/40" aria-hidden />
        </div>
      )}
    </div>
  );
}

/** Primary text cut like the feed, with a working "See more". */
function FeedText({ text, limit, moreLabel, className }: { text: string; limit: number; moreLabel: string; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!text.trim()) return <p className={cn("italic text-muted-foreground", className)}>Primary text appears here…</p>;
  const { visible, truncated } = truncateForFeed(text, limit);
  return (
    <p className={cn("whitespace-pre-wrap break-words", className)}>
      {expanded || !truncated ? text : visible}
      {truncated && !expanded && (
        <>
          …{" "}
          <button type="button" className="font-medium text-muted-foreground hover:underline" onClick={() => setExpanded(true)}>
            {moreLabel}
          </button>
        </>
      )}
    </p>
  );
}

/** Where each mock cuts primary text behind "See more" — the same numbers the length badges use. */
function primaryLimit(id: PlacementId): number {
  return placementById(id).limits.primaryText ?? 125;
}

function FacebookFeed({ image, primary, headline, description, pageName, domain, device }: MockProps & { device: Device }) {
  return (
    <div className={cn("mx-auto overflow-hidden rounded-2xl bg-card text-card-foreground shadow-sm ring-1 ring-foreground/10", device === "mobile" ? "max-w-[340px]" : "max-w-[500px]")}>
      <div className="flex items-center gap-2.5 px-3 pb-2 pt-3">
        <Avatar name={pageName} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{pageName}</p>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            Sponsored · <Globe className="size-2.5" aria-hidden />
          </p>
        </div>
        <MoreHorizontal className="size-4 text-muted-foreground" aria-hidden />
      </div>
      <div className="px-3 pb-2">
        <FeedText key={primary} text={primary} limit={primaryLimit("facebook_feed")} moreLabel="See more" className="text-sm leading-relaxed" />
      </div>
      <CreativeImage src={image} className="aspect-square" />
      <div className="flex items-center gap-3 bg-muted/50 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] uppercase text-muted-foreground">{domain ?? "yourwebsite.com"}</p>
          <p className="truncate text-sm font-semibold leading-tight">{headline || "Headline appears here"}</p>
          {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
        </div>
        <span className="shrink-0 rounded-lg bg-background px-3 py-1.5 text-xs font-semibold ring-1 ring-foreground/10">Learn more</span>
      </div>
      <div className="flex items-center justify-around border-t px-3 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><ThumbsUp className="size-3.5" aria-hidden /> Like</span>
        <span className="flex items-center gap-1.5"><MessageCircle className="size-3.5" aria-hidden /> Comment</span>
        <span className="flex items-center gap-1.5"><Share2 className="size-3.5" aria-hidden /> Share</span>
      </div>
    </div>
  );
}

function InstagramFeed({ image, primary, pageName }: MockProps) {
  const handle = pageName.toLowerCase().replace(/[^a-z0-9._]+/g, "") || "brand";
  return (
    <div className="mx-auto max-w-[340px] overflow-hidden rounded-2xl bg-card text-card-foreground shadow-sm ring-1 ring-foreground/10">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Avatar name={pageName} size="size-8" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold leading-tight">{handle}</p>
          <p className="text-[10px] text-muted-foreground">Sponsored</p>
        </div>
        <MoreHorizontal className="size-4 text-muted-foreground" aria-hidden />
      </div>
      <CreativeImage src={image} className="aspect-square" />
      <div className="flex items-center justify-between border-b px-3 py-2">
        <p className="text-xs font-semibold">Learn more</p>
        <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
      </div>
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-3.5">
          <Heart className="size-5" aria-hidden />
          <MessageCircle className="size-5" aria-hidden />
          <Send className="size-5" aria-hidden />
        </div>
        <Bookmark className="size-5" aria-hidden />
      </div>
      <div className="px-3 pb-3 text-xs leading-relaxed">
        <span className="mr-1 font-semibold">{handle}</span>
        <FeedText key={primary} text={primary} limit={primaryLimit("instagram_feed")} moreLabel="more" className="inline" />
      </div>
    </div>
  );
}

function Stories({ image, primary, pageName }: MockProps) {
  const { visible, truncated } = truncateForFeed(primary, primaryLimit("stories"));
  return (
    <div className="relative mx-auto aspect-[9/16] w-full max-w-[280px] overflow-hidden rounded-3xl bg-black text-white shadow-sm ring-1 ring-foreground/10">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="Ad creative" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <ImageIcon className="size-10 text-white/40" aria-hidden />
        </div>
      )}
      <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent p-3">
        <div className="mb-2 h-0.5 rounded-full bg-white/40" />
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-full bg-white/20 text-[11px] font-semibold">
            {pageName.trim().charAt(0).toUpperCase() || "A"}
          </span>
          <span className="truncate text-xs font-semibold">{pageName}</span>
          <span className="text-[10px] text-white/70">Sponsored</span>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/75 via-black/40 to-transparent p-3 pt-10">
        {primary.trim() && (
          <p className="whitespace-pre-wrap text-xs leading-snug">
            {truncated ? `${visible}…` : primary}
          </p>
        )}
        <div className="flex justify-center">
          <span className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black">Learn more</span>
        </div>
      </div>
    </div>
  );
}

interface MockProps {
  image: string | null;
  primary: string;
  headline: string;
  description: string;
  pageName: string;
  domain: string | null;
}

/** Memoized — the generator re-renders while copy streams in. */
export const AdPreview = memo(function AdPreview({
  images,
  imageKey,
  onImageChange,
  primaryTexts,
  headlines,
  descriptions,
  selected,
  onSelect,
  pageName,
  websiteUrl,
}: AdPreviewProps) {
  const [placement, setPlacement] = useState<PlacementId>("facebook_feed");
  const [device, setDevice] = useState<Device>("mobile");

  const pick = (list: CopyVariant[], id: string | null) => list.find((v) => v.id === id) ?? list.find((v) => v.text.trim()) ?? null;
  const primary = pick(primaryTexts, selected.primaryText);
  const headline = pick(headlines, selected.headline);
  const description = pick(descriptions, selected.description);
  const image = images.find((i) => i.key === imageKey) ?? images[0] ?? null;

  const spec = placementById(placement);
  const mock: MockProps = {
    image: image?.src ?? null,
    primary: primary?.text ?? "",
    headline: headline?.text ?? "",
    description: description?.text ?? "",
    pageName: pageName || "Your Page",
    domain: displayDomain(websiteUrl),
  };

  const checks: { field: CopyField; label: string; text: string }[] = [
    { field: "primaryText", label: "Primary text", text: mock.primary },
    { field: "headline", label: "Headline", text: mock.headline },
    { field: "description", label: "Description", text: mock.description },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 border-b p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold tracking-tight">Preview</h3>
          {placement === "facebook_feed" && (
            <ToggleGroup type="single" size="sm" value={device} onValueChange={(v) => v && setDevice(v as Device)} aria-label="Device">
              <ToggleGroupItem value="mobile" aria-label="Mobile">
                <Smartphone />
              </ToggleGroupItem>
              <ToggleGroupItem value="desktop" aria-label="Desktop">
                <Monitor />
              </ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={placement}
          onValueChange={(v) => v && setPlacement(v as PlacementId)}
          aria-label="Placement"
          className="flex-wrap"
        >
          <ToggleGroupItem value="facebook_feed">Facebook</ToggleGroupItem>
          <ToggleGroupItem value="instagram_feed">Instagram</ToggleGroupItem>
          <ToggleGroupItem value="stories">Stories</ToggleGroupItem>
        </ToggleGroup>
        <div className="space-y-2">
          {images.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs text-muted-foreground">Image</span>
              <Select value={image?.key} onValueChange={onImageChange}>
                <SelectTrigger className="h-8 min-w-0 flex-1 text-xs" aria-label="Preview image">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {images.map((img) => (
                    <SelectItem key={img.key} value={img.key}>
                      {img.label.length > 44 ? `${img.label.slice(0, 42)}…` : img.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <VariantSelect label="Text" field="primaryText" list={primaryTexts} value={primary?.id ?? null} onSelect={onSelect} />
          <VariantSelect label="Headline" field="headline" list={headlines} value={headline?.id ?? null} onSelect={onSelect} />
          <VariantSelect label="Desc." field="description" list={descriptions} value={description?.id ?? null} onSelect={onSelect} />
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/30 p-4">
        {placement === "facebook_feed" ? (
          <FacebookFeed {...mock} device={device} />
        ) : placement === "instagram_feed" ? (
          <InstagramFeed {...mock} />
        ) : (
          <Stories {...mock} />
        )}

        <div className="flex flex-wrap justify-center gap-1.5">
          {checks.map(({ field, label, text }) => {
            const limit = spec.limits[field];
            const count = charCount(text.trim());
            if (limit == null || !count) return null;
            const over = count > limit;
            return (
              <StatusBadge key={field} tone={over ? (field === "primaryText" ? "info" : "warning") : "success"} className="font-normal">
                {label} {count}/{limit}
              </StatusBadge>
            );
          })}
        </div>
        <p className="text-center text-[11px] text-muted-foreground">
          {spec.label} guidance from Meta&apos;s ads guide. Real rendering varies by device and format.
        </p>
      </div>
    </div>
  );
});
