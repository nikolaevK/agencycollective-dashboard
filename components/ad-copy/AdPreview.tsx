"use client";

import { useState } from "react";
import {
  ImageIcon,
  ThumbsUp,
  MessageCircle,
  Share2,
  Globe,
  MoreHorizontal,
  Monitor,
  Smartphone,
  Heart,
  Send,
  Bookmark,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CopyVariation {
  title: string;
  body: string;
}

export interface AdPreviewProps {
  imageUrl: string | null;
  primaryText: string;
  headline: string;
  description?: string;
  pageName?: string;
  // Selection options
  primaryTexts?: CopyVariation[];
  headlines?: string[];
  descriptions?: string[];
  previewPrimaryIdx?: number;
  previewHeadlineIdx?: number;
  previewDescriptionIdx?: number;
  onPrimaryIdxChange?: (idx: number) => void;
  onHeadlineIdxChange?: (idx: number) => void;
  onDescriptionIdxChange?: (idx: number) => void;
}

type PlatformType = "facebook" | "instagram";
type DeviceType = "mobile" | "desktop";

// ─── Inline selector dropdown ─────────────────────────────────────────────
function PreviewSelector({
  label,
  options,
  selectedIdx,
  onChange,
  getLabel,
}: {
  label: string;
  options: number;
  selectedIdx: number;
  onChange: (idx: number) => void;
  getLabel: (idx: number) => string;
}) {
  if (options <= 1) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider shrink-0">
        {label}
      </span>
      <div className="relative flex-1">
        <select
          value={selectedIdx}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full appearance-none rounded border bg-card px-2 py-1 pr-6 text-[11px] font-medium text-foreground outline-none focus:border-primary transition-colors truncate"
        >
          {Array.from({ length: options }, (_, i) => (
            <option key={i} value={i}>
              {getLabel(i)}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  );
}

// ─── Facebook Preview ─────────────────────────────────────────────────────
function FacebookPreview({
  imageUrl,
  primaryText,
  headline,
  description,
  pageName,
  device,
}: {
  imageUrl: string | null;
  primaryText: string;
  headline: string;
  description: string;
  pageName: string;
  device: DeviceType;
}) {
  return (
    <div
      className={cn(
        "mx-auto rounded-xl border bg-card shadow-sm overflow-hidden",
        device === "mobile" ? "max-w-[320px]" : "max-w-[500px]"
      )}
    >
      {/* Page header */}
      <div className="flex items-center gap-2.5 px-3 pt-3 pb-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-bold">
          {pageName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight truncate">
            {pageName}
          </p>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            Sponsored · <Globe className="h-2.5 w-2.5" />
          </p>
        </div>
        <MoreHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>

      {/* Primary text */}
      <div className="px-3 pb-2">
        {primaryText ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap line-clamp-5">
            {primaryText}
            {primaryText.length > 200 && (
              <span className="text-muted-foreground ml-1">... more</span>
            )}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            Primary text will appear here...
          </p>
        )}
      </div>

      {/* Creative image */}
      <div className="aspect-square w-full bg-muted">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="Ad creative"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageIcon className="h-12 w-12 text-muted-foreground/30" />
          </div>
        )}
      </div>

      {/* CTA bar */}
      <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-2.5">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground truncate">
            yourwebsite.com
          </p>
          <p className="text-sm font-semibold truncate leading-tight">
            {headline || "Headline will appear here"}
          </p>
          {description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {description}
            </p>
          )}
        </div>
        <span className="ml-3 shrink-0 rounded-md bg-muted px-3 py-1.5 text-xs font-semibold">
          Learn More
        </span>
      </div>

      {/* Engagement bar */}
      <div className="flex items-center justify-around border-t px-3 py-2">
        <button className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ThumbsUp className="h-3.5 w-3.5" /> Like
        </button>
        <button className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MessageCircle className="h-3.5 w-3.5" /> Comment
        </button>
        <button className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Share2 className="h-3.5 w-3.5" /> Share
        </button>
      </div>
    </div>
  );
}

// ─── Instagram Preview ────────────────────────────────────────────────────
function InstagramPreview({
  imageUrl,
  primaryText,
  pageName,
}: {
  imageUrl: string | null;
  primaryText: string;
  pageName: string;
}) {
  return (
    <div className="mx-auto max-w-[320px] rounded-xl border bg-card shadow-sm overflow-hidden">
      {/* Instagram header */}
      <div className="flex items-center justify-between px-3 pt-2 pb-0">
        <p className="text-[11px] font-medium text-muted-foreground tracking-wide">
          Instagram
        </p>
      </div>

      {/* Page header */}
      <div className="flex items-center gap-2.5 px-3 pt-2 pb-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 p-[2px]">
          <div className="flex h-full w-full items-center justify-center rounded-full bg-card text-[10px] font-bold text-primary">
            {pageName.charAt(0).toUpperCase()}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold leading-tight truncate">
            {pageName}
          </p>
          <p className="text-[10px] text-muted-foreground">Ad</p>
        </div>
        <MoreHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>

      {/* CTA bar above image */}
      <div className="flex items-center justify-between border-y bg-muted/20 px-3 py-2">
        <p className="text-xs font-medium truncate">Learn more</p>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </div>

      {/* Creative image */}
      <div className="aspect-square w-full bg-muted">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="Ad creative"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageIcon className="h-12 w-12 text-muted-foreground/30" />
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-3.5">
          <Heart className="h-5 w-5 text-foreground" />
          <MessageCircle className="h-5 w-5 text-foreground" />
          <Send className="h-5 w-5 text-foreground" />
        </div>
        <Bookmark className="h-5 w-5 text-foreground" />
      </div>

      {/* Caption */}
      <div className="px-3 pb-3">
        {primaryText ? (
          <p className="text-xs leading-relaxed">
            <span className="font-semibold mr-1">
              {pageName.toLowerCase().replace(/\s+/g, "")}
            </span>
            <span className="line-clamp-2">
              {primaryText}
              {primaryText.length > 100 && (
                <span className="text-muted-foreground ml-0.5">... more</span>
              )}
            </span>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            Caption will appear here...
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main Preview Component ──────────────────────────────────────────────
export function AdPreview({
  imageUrl,
  primaryText,
  headline,
  description = "",
  pageName = "Your Page",
  primaryTexts = [],
  headlines = [],
  descriptions = [],
  previewPrimaryIdx = 0,
  previewHeadlineIdx = 0,
  previewDescriptionIdx = 0,
  onPrimaryIdxChange,
  onHeadlineIdxChange,
  onDescriptionIdxChange,
}: AdPreviewProps) {
  const [platform, setPlatform] = useState<PlatformType>("facebook");
  const [device, setDevice] = useState<DeviceType>("mobile");

  const hasOptions =
    primaryTexts.length > 1 || headlines.length > 1 || descriptions.length > 1;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <p className="text-sm font-semibold">Ad preview</p>
        <div className="flex items-center gap-2">
          {/* Platform toggle */}
          <div className="flex items-center gap-0.5 rounded-lg border p-0.5">
            <button
              onClick={() => setPlatform("facebook")}
              className={cn(
                "rounded px-2 py-0.5 text-[10px] font-medium transition-colors",
                platform === "facebook"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Facebook
            </button>
            <button
              onClick={() => setPlatform("instagram")}
              className={cn(
                "rounded px-2 py-0.5 text-[10px] font-medium transition-colors",
                platform === "instagram"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Instagram
            </button>
          </div>

          {/* Device toggle (Facebook only) */}
          {platform === "facebook" && (
            <div className="flex items-center gap-1 rounded-lg border p-0.5">
              <button
                onClick={() => setDevice("mobile")}
                className={cn(
                  "rounded p-1 transition-colors",
                  device === "mobile"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Mobile"
              >
                <Smartphone className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setDevice("desktop")}
                className={cn(
                  "rounded p-1 transition-colors",
                  device === "desktop"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Desktop"
              >
                <Monitor className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Variation selectors */}
      {hasOptions && (
        <div className="border-b px-4 py-2.5 space-y-2">
          <PreviewSelector
            label="Text"
            options={primaryTexts.length}
            selectedIdx={previewPrimaryIdx}
            onChange={(idx) => onPrimaryIdxChange?.(idx)}
            getLabel={(i) =>
              primaryTexts[i]?.title
                ? `${i + 1}. ${primaryTexts[i].title}`
                : `Option ${i + 1}`
            }
          />
          <PreviewSelector
            label="Headline"
            options={headlines.length}
            selectedIdx={previewHeadlineIdx}
            onChange={(idx) => onHeadlineIdxChange?.(idx)}
            getLabel={(i) =>
              headlines[i]
                ? `${i + 1}. ${headlines[i].slice(0, 40)}`
                : `Headline ${i + 1}`
            }
          />
          <PreviewSelector
            label="Desc."
            options={descriptions.length}
            selectedIdx={previewDescriptionIdx}
            onChange={(idx) => onDescriptionIdxChange?.(idx)}
            getLabel={(i) =>
              descriptions[i]
                ? `${i + 1}. ${descriptions[i].slice(0, 40)}`
                : `Description ${i + 1}`
            }
          />
        </div>
      )}

      {/* Preview area */}
      <div className="flex-1 overflow-y-auto p-4">
        {platform === "facebook" ? (
          <FacebookPreview
            imageUrl={imageUrl}
            primaryText={primaryText}
            headline={headline}
            description={description}
            pageName={pageName}
            device={device}
          />
        ) : (
          <InstagramPreview
            imageUrl={imageUrl}
            primaryText={primaryText}
            pageName={pageName}
          />
        )}

        <p className="mt-3 text-center text-[10px] text-muted-foreground">
          Ad rendering may vary based on device, format, and other factors.
        </p>
      </div>
    </div>
  );
}
