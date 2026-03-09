"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Loader2, Check, X, AlertCircle, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdSets } from "@/hooks/useAdSets";
import { useQuery } from "@tanstack/react-query";
import type { DateRangeInput, ApiResponse } from "@/types/api";
import type { CampaignCreative, UploadedImage, CopyVariation } from "@/types/dashboard";

interface MetaPage {
  id: string;
  name: string;
}

interface CreateDraftModalProps {
  open: boolean;
  onClose: () => void;
  accountId: string;
  campaignId: string;
  campaignName: string;
  primaryTexts: CopyVariation[];
  headlines: string[];
  descriptions: string[];
  primaryIdx: number;
  headlineIdx: number;
  descriptionIdx: number;
  uploadedImages: UploadedImage[];
  selectedCreatives: CampaignCreative[];
  allCreatives: CampaignCreative[];
  dateRange: DateRangeInput;
}

type ModalState = "idle" | "loading" | "success" | "error";

/** A selectable image — either an uploaded file (has base64) or a campaign creative (has hash/url). */
interface ImageOption {
  id: string;
  label: string;
  previewSrc: string;
  /** Present for uploaded images — sent directly to Meta. */
  base64?: string;
  mediaType?: string;
  /** Present for campaign creative images — Meta already has this image. */
  imageHash?: string;
  /** Fallback URL if no hash — server downloads this. */
  imageUrl?: string;
}

export function CreateDraftModal({
  open,
  onClose,
  accountId,
  campaignId,
  campaignName,
  primaryTexts,
  headlines,
  descriptions,
  primaryIdx,
  headlineIdx,
  descriptionIdx,
  uploadedImages,
  selectedCreatives,
  allCreatives,
  dateRange,
}: CreateDraftModalProps) {
  const [adsetId, setAdsetId] = useState("");
  const [pageId, setPageId] = useState("");
  const [adName, setAdName] = useState(
    `${campaignName} - Draft - ${new Date().toISOString().slice(0, 10)}`
  );
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [state, setState] = useState<ModalState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [createdAdId, setCreatedAdId] = useState("");

  // Fetch ad sets
  const { data: adSets, isLoading: adSetsLoading } = useAdSets(campaignId, dateRange);

  // Auto-detect page from campaign creatives (check all, not just selected)
  const detectedPageId = useMemo(() => {
    for (const c of allCreatives) {
      if (c.pageId) return c.pageId;
    }
    return null;
  }, [allCreatives]);

  // Only fetch pages API as fallback when no page detected from creatives
  const needsPagesFetch = open && !detectedPageId;
  const { data: pages, isLoading: pagesLoading } = useQuery({
    queryKey: ["accountPages", accountId],
    queryFn: async () => {
      const res = await fetch(`/api/ad-copy/pages?accountId=${accountId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json: ApiResponse<MetaPage[]> = await res.json();
      return json.data;
    },
    enabled: needsPagesFetch,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // Auto-set pageId from detected page or first fetched page
  useEffect(() => {
    if (detectedPageId) {
      setPageId(detectedPageId);
    } else if (pages && pages.length > 0 && !pageId) {
      setPageId(pages[0].id);
    }
  }, [detectedPageId, pages, pageId]);

  // Build unified image options list
  const imageOptions = useMemo<ImageOption[]>(() => {
    const options: ImageOption[] = [];

    // Uploaded images first (have base64 ready)
    for (const img of uploadedImages) {
      options.push({
        id: `upload:${img.id}`,
        label: img.name,
        previewSrc: img.preview,
        base64: img.base64,
        mediaType: img.mediaType,
      });
    }

    // Campaign creative images — prefer imageHash (already on Meta, no upload needed)
    for (const c of selectedCreatives) {
      const preview = c.thumbnailUrl || c.imageUrl;
      if (!c.imageHash && !c.imageUrl && !preview) continue;
      options.push({
        id: `creative:${c.adId}`,
        label: c.adName,
        previewSrc: preview!,
        imageHash: c.imageHash ?? undefined,
        imageUrl: c.imageUrl ?? undefined,
      });
    }

    return options;
  }, [uploadedImages, selectedCreatives]);

  const [selectedImageId, setSelectedImageId] = useState<string>("");

  // Auto-select first image when options change
  useEffect(() => {
    if (imageOptions.length > 0 && !imageOptions.find((o) => o.id === selectedImageId)) {
      setSelectedImageId(imageOptions[0].id);
    }
  }, [imageOptions, selectedImageId]);

  const selectedImage = imageOptions.find((o) => o.id === selectedImageId) ?? null;

  function handleClose() {
    if (state === "loading") return;
    setState("idle");
    setErrorMsg("");
    setCreatedAdId("");
    onClose();
  }

  async function handleSubmit() {
    if (!adsetId || !pageId || !selectedImage) return;

    setState("loading");
    setErrorMsg("");

    try {
      const payload: Record<string, string | undefined> = {
        accountId,
        adsetId,
        pageId,
        adName,
        primaryText: primaryTexts[primaryIdx]?.body ?? "",
        headline: headlines[headlineIdx] ?? "",
        description: descriptions[descriptionIdx] ?? "",
        websiteUrl: websiteUrl || undefined,
      };

      // Provide the user-selected image
      if (selectedImage.base64) {
        payload.imageBase64 = selectedImage.base64;
        payload.imageMediaType = selectedImage.mediaType;
      } else if (selectedImage.imageHash) {
        payload.imageHash = selectedImage.imageHash;
      } else if (selectedImage.imageUrl) {
        payload.imageUrl = selectedImage.imageUrl;
      }

      const res = await fetch("/api/ad-copy/publish-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Failed (${res.status})`);
      }

      setCreatedAdId(data.adId);
      setState("success");
    } catch (err) {
      setErrorMsg((err as Error).message);
      setState("error");
    }
  }

  if (!open) return null;

  const pageResolved = Boolean(pageId);
  const pageLoading = needsPagesFetch && pagesLoading;
  const canSubmit =
    adsetId && pageResolved && selectedImage && primaryTexts.length > 0 && headlines.length > 0 && descriptions.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg rounded-xl border bg-card shadow-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">Create Draft Ad</h2>
          <button
            onClick={handleClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {/* Success state */}
          {state === "success" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                <Check className="h-6 w-6 text-green-500" />
              </div>
              <p className="text-sm font-medium text-foreground">Draft ad created successfully!</p>
              <p className="text-xs text-muted-foreground">Ad ID: {createdAdId}</p>
              <p className="text-xs text-muted-foreground">
                The ad has been created with PAUSED status in Meta Ads Manager.
              </p>
              <button
                onClick={handleClose}
                className="mt-2 rounded-lg border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                Close
              </button>
            </div>
          )}

          {/* Form state */}
          {state !== "success" && (
            <>
              {/* Image selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Creative Image *</label>
                {imageOptions.length > 0 ? (
                  <div className="grid grid-cols-4 gap-2">
                    {imageOptions.map((img) => {
                      const isSelected = img.id === selectedImageId;
                      return (
                        <button
                          key={img.id}
                          type="button"
                          onClick={() => setSelectedImageId(img.id)}
                          className={cn(
                            "relative aspect-square overflow-hidden rounded-lg border-2 transition-all",
                            isSelected
                              ? "border-primary ring-1 ring-primary/30"
                              : "border-transparent hover:border-muted-foreground/30"
                          )}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.previewSrc}
                            alt={img.label}
                            className="h-full w-full object-cover"
                          />
                          {isSelected && (
                            <div className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary">
                              <Check className="h-2.5 w-2.5 text-primary-foreground" />
                            </div>
                          )}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1">
                            <p className="text-[9px] text-white truncate leading-tight">
                              {img.label}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                    <ImageIcon className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      No images available. Upload images or select creatives with images.
                    </span>
                  </div>
                )}
              </div>

              {/* Ad Set selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Ad Set *</label>
                <select
                  value={adsetId}
                  onChange={(e) => setAdsetId(e.target.value)}
                  disabled={adSetsLoading}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
                >
                  <option value="">
                    {adSetsLoading ? "Loading ad sets..." : "Select an ad set"}
                  </option>
                  {adSets?.map((as) => (
                    <option key={as.id} value={as.id}>
                      {as.name} ({as.status})
                    </option>
                  ))}
                </select>
              </div>

              {/* Facebook Page — auto-detected or fallback selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Facebook Page *</label>
                {detectedPageId ? (
                  <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                    <Check className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-sm text-foreground">
                      Page ID: {detectedPageId}
                    </span>
                    <span className="text-[10px] text-muted-foreground">(from campaign)</span>
                  </div>
                ) : pageLoading ? (
                  <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Loading pages...</span>
                  </div>
                ) : pages && pages.length > 0 ? (
                  <select
                    value={pageId}
                    onChange={(e) => setPageId(e.target.value)}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
                  >
                    {pages.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      No page detected. Select creatives with existing ads to auto-detect.
                    </span>
                  </div>
                )}
              </div>

              {/* Primary Text (from preview selection) */}
              {primaryTexts[primaryIdx] && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Primary Text
                    {primaryTexts[primaryIdx].title && (
                      <span className="ml-1 text-foreground">— {primaryTexts[primaryIdx].title}</span>
                    )}
                  </label>
                  <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-foreground whitespace-pre-wrap line-clamp-4">
                    {primaryTexts[primaryIdx].body}
                  </div>
                </div>
              )}

              {/* Headline (from preview selection) */}
              {headlines[headlineIdx] && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Headline</label>
                  <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm font-medium text-foreground">
                    {headlines[headlineIdx]}
                  </div>
                </div>
              )}

              {/* Description (from preview selection) */}
              {descriptions[descriptionIdx] && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Description</label>
                  <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-foreground">
                    {descriptions[descriptionIdx]}
                  </div>
                </div>
              )}

              {/* Ad Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Ad Name *</label>
                <input
                  type="text"
                  value={adName}
                  onChange={(e) => setAdName(e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
                />
              </div>

              {/* Website URL */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Website URL (optional)</label>
                <input
                  type="url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
                />
              </div>

              {/* Error message */}
              {state === "error" && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <p className="text-sm text-red-600 dark:text-red-400">{errorMsg}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {state !== "success" && (
          <div className="flex items-center justify-end gap-2 border-t px-5 py-4">
            <button
              onClick={handleClose}
              disabled={state === "loading"}
              className="rounded-lg border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || state === "loading"}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:opacity-40 disabled:cursor-not-allowed"
              )}
            >
              {state === "loading" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Draft Ad"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
