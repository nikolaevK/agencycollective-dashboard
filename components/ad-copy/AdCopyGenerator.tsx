"use client";

import { useState, useRef, useCallback } from "react";
import {
  PenTool,
  Sparkles,
  Loader2,
  ChevronDown,
  X,
  Plus,
  Copy,
  Check,
  RefreshCw,
  AlertCircle,
  Square,
  Upload,
  ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDateRange } from "@/hooks/useDateRange";
import { useAccounts } from "@/hooks/useAccounts";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useCampaignCreatives } from "@/hooks/useCampaignCreatives";
import { AdCopySelector } from "./AdCopySelector";
import { CreativeGrid } from "./CreativeGrid";
import { AdPreview } from "./AdPreview";
import { CHAT_MODELS, type ChatModelId } from "@/lib/chatModels";
import type { CampaignCreative, UploadedImage, CopyVariation } from "@/types/dashboard";
import { CreateDraftModal } from "./CreateDraftModal";

// ─── Industry presets ───────────────────────────────────────────────────────
const INDUSTRY_PRESETS = [
  { id: "peptides", label: "Peptides" },
  { id: "supplements", label: "Supplements" },
  { id: "skincare", label: "Skincare" },
  { id: "fitness", label: "Fitness" },
  { id: "wellness", label: "Health & Wellness" },
  { id: "custom", label: "Custom..." },
] as const;

type IndustryId = (typeof INDUSTRY_PRESETS)[number]["id"];

// ─── Uploaded image helpers ──────────────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB (Claude limit)
const MAX_UPLOADS = 10;

function fileToUploadedImage(file: File): Promise<UploadedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // dataUrl = "data:image/jpeg;base64,/9j/..."
      const base64 = dataUrl.split(",")[1];
      resolve({
        id: `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        preview: URL.createObjectURL(file),
        base64,
        mediaType: file.type as UploadedImage["mediaType"],
      });
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

// ─── Parse Claude response into structured fields ──────────────────────────
function parseGeneratedCopy(text: string): {
  primaryTexts: CopyVariation[];
  headlines: string[];
  descriptions: string[];
} {
  const primaryTexts: CopyVariation[] = [];
  const headlines: string[] = [];
  const descriptions: string[] = [];

  const primaryMatch = text.match(/## Primary Text Options?\s*\n([\s\S]*?)(?=\n## |$)/i);
  const headlineMatch = text.match(/## Headlines?\s*\n([\s\S]*?)(?=\n## |$)/i);
  const descriptionMatch = text.match(/## Descriptions?\s*\n([\s\S]*?)(?=\n## |$)/i);

  if (primaryMatch) {
    // Split by ### N. headings — each chunk starts with the title line
    const items = primaryMatch[1].split(/###\s+\d+\.\s*/);
    for (const item of items) {
      const trimmedItem = item.trim();
      if (!trimmedItem) continue;

      // First line is the hook title, rest is the body
      const newlineIdx = trimmedItem.indexOf("\n");
      if (newlineIdx === -1) {
        // Only a title, no body
        primaryTexts.push({ title: trimmedItem, body: "" });
      } else {
        const title = trimmedItem.slice(0, newlineIdx).trim();
        const body = trimmedItem.slice(newlineIdx + 1).trim();
        primaryTexts.push({ title, body });
      }
    }
  }

  if (headlineMatch) {
    const lines = headlineMatch[1].split("\n");
    for (const line of lines) {
      const match = line.match(/^\d+\.\s+(.+)/);
      if (match) headlines.push(match[1].trim());
    }
  }

  if (descriptionMatch) {
    const lines = descriptionMatch[1].split("\n");
    for (const line of lines) {
      const match = line.match(/^\d+\.\s+(.+)/);
      if (match) descriptions.push(match[1].trim());
    }
  }

  return { primaryTexts, headlines, descriptions };
}

// ─── Copyable text field ────────────────────────────────────────────────────
function CopyableField({
  value,
  onChange,
  onRemove,
  placeholder,
  multiline = false,
  label,
}: {
  value: string;
  onChange: (val: string) => void;
  onRemove?: () => void;
  placeholder?: string;
  multiline?: boolean;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="group relative rounded-lg border bg-card transition-colors hover:border-muted-foreground/30">
      {label && (
        <span className="absolute -top-2.5 left-2.5 bg-card px-1 text-[10px] font-medium text-muted-foreground">
          {label}
        </span>
      )}
      <div className="flex items-start">
        <div className="flex-1 p-3">
          {multiline ? (
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              rows={4}
              className="w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground/50"
            />
          ) : (
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/50"
            />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5 p-1.5">
          <button
            onClick={handleCopy}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Copy"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          {onRemove && (
            <button
              onClick={onRemove}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Remove"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export function AdCopyGenerator() {
  const { dateRange } = useDateRange();

  // Selection state
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | undefined>();
  const [selectedCreativeIds, setSelectedCreativeIds] = useState<Set<string>>(new Set());

  // Uploaded images
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Config
  const [model, setModel] = useState<ChatModelId>("claude-sonnet-4-6");
  const [industry, setIndustry] = useState<IndustryId>("peptides");
  const [customIndustry, setCustomIndustry] = useState("");

  // Generated content (editable fields)
  const [primaryTexts, setPrimaryTexts] = useState<CopyVariation[]>([]);
  const [headlines, setHeadlines] = useState<string[]>([]);
  const [descriptions, setDescriptions] = useState<string[]>([]);

  // Preview selection indices
  const [previewPrimaryIdx, setPreviewPrimaryIdx] = useState(0);
  const [previewHeadlineIdx, setPreviewHeadlineIdx] = useState(0);
  const [previewDescriptionIdx, setPreviewDescriptionIdx] = useState(0);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Draft modal
  const [draftModalOpen, setDraftModalOpen] = useState(false);

  // Data hooks
  const { data: accounts } = useAccounts(dateRange);
  const { data: campaigns } = useCampaigns(selectedAccountId, dateRange);
  const { data: creatives, isLoading: creativesLoading } = useCampaignCreatives(
    selectedAccountId,
    selectedCampaignId,
    dateRange
  );

  const selectedAccount = accounts?.find((a) => a.id === selectedAccountId);
  const selectedCampaign = campaigns?.find((c) => c.id === selectedCampaignId);

  // Get selected creatives data
  const selectedCreativesData: CampaignCreative[] =
    creatives?.filter((c) => selectedCreativeIds.has(c.adId)) ?? [];

  // First selected creative or uploaded image for preview
  const previewImageUrl =
    selectedCreativesData[0]?.imageUrl ?? uploadedImages[0]?.preview ?? creatives?.[0]?.imageUrl ?? null;

  // ── Handlers ────────────────────────────────────────────────────────────
  function handleSelect(accountId: string, campaignId: string) {
    const accountChanged = accountId !== selectedAccountId;
    const campaignChanged = campaignId !== selectedCampaignId;

    if (accountChanged || campaignChanged) {
      setSelectedAccountId(accountId);
      setSelectedCampaignId(campaignId);
      setSelectedCreativeIds(new Set());
      resetGeneration();
    }
  }

  function handleClear() {
    setSelectedAccountId(undefined);
    setSelectedCampaignId(undefined);
    setSelectedCreativeIds(new Set());
    resetGeneration();
  }

  function toggleCreative(adId: string) {
    setSelectedCreativeIds((prev) => {
      const next = new Set(prev);
      if (next.has(adId)) next.delete(adId);
      else if (next.size < 10) next.add(adId);
      return next;
    });
  }

  function selectAllCreatives() {
    if (!creatives) return;
    const ids = creatives.slice(0, 10).map((c) => c.adId);
    setSelectedCreativeIds(new Set(ids));
  }

  function clearAllCreatives() {
    setSelectedCreativeIds(new Set());
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;

    const remaining = MAX_UPLOADS - uploadedImages.length;
    const toProcess = Array.from(files).slice(0, remaining);

    const results: UploadedImage[] = [];
    for (const file of toProcess) {
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) continue;
      if (file.size > MAX_IMAGE_SIZE) continue;
      try {
        results.push(await fileToUploadedImage(file));
      } catch {
        // skip failed files
      }
    }

    setUploadedImages((prev) => [...prev, ...results].slice(0, MAX_UPLOADS));
    // reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeUploadedImage(id: string) {
    setUploadedImages((prev) => {
      const img = prev.find((i) => i.id === id);
      if (img) URL.revokeObjectURL(img.preview);
      return prev.filter((i) => i.id !== id);
    });
  }

  function clearUploadedImages() {
    uploadedImages.forEach((img) => URL.revokeObjectURL(img.preview));
    setUploadedImages([]);
  }

  function resetGeneration() {
    setPrimaryTexts([]);
    setHeadlines([]);
    setDescriptions([]);
    setStreamingText("");
    setError(null);
    setHasGenerated(false);
    setPreviewPrimaryIdx(0);
    setPreviewHeadlineIdx(0);
    setPreviewDescriptionIdx(0);
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  // Whether there's enough input to generate
  const canGenerate =
    (selectedCreativesData.length > 0 || uploadedImages.length > 0) && Boolean(selectedCampaign);

  const handleGenerate = useCallback(async () => {
    if (!selectedCampaign) return;
    if (selectedCreativesData.length === 0 && uploadedImages.length === 0) return;

    setIsGenerating(true);
    setStreamingText("");
    setError(null);
    setPrimaryTexts([]);
    setHeadlines([]);
    setDescriptions([]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/ad-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedCreatives: selectedCreativesData.map((c) => ({
            adId: c.adId,
            adName: c.adName,
            imageUrl: c.imageUrl,
            existingPrimaryText: c.existingPrimaryText,
            existingHeadline: c.existingHeadline,
            existingDescription: c.existingDescription,
            spend: c.spend,
            ctr: c.ctr,
          })),
          uploadedImages: uploadedImages.map((img) => ({
            name: img.name,
            base64: img.base64,
            mediaType: img.mediaType,
          })),
          campaignName: selectedCampaign.name,
          campaignObjective: selectedCampaign.objective,
          campaignSpend: selectedCampaign.insights.spend,
          campaignRoas: selectedCampaign.insights.roas,
          model,
          industry,
          customIndustry: industry === "custom" ? customIndustry : undefined,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(body.error || `Generation failed (${res.status})`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setStreamingText(accumulated);
      }

      // Parse completed text into structured fields
      const parsed = parseGeneratedCopy(accumulated);
      if (parsed.primaryTexts.length > 0) setPrimaryTexts(parsed.primaryTexts);
      if (parsed.headlines.length > 0) setHeadlines(parsed.headlines);
      if (parsed.descriptions.length > 0) setDescriptions(parsed.descriptions);
      setHasGenerated(true);
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        // User stopped — try to parse what we have
        if (streamingText) {
          const parsed = parseGeneratedCopy(streamingText);
          if (parsed.primaryTexts.length > 0) setPrimaryTexts(parsed.primaryTexts);
          if (parsed.headlines.length > 0) setHeadlines(parsed.headlines);
          if (parsed.descriptions.length > 0) setDescriptions(parsed.descriptions);
        }
        setHasGenerated(true);
      } else {
        setError((err as Error).message);
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  }, [selectedCreativesData, selectedCampaign, uploadedImages, model, industry, customIndustry, streamingText]);

  // ── Update individual fields ────────────────────────────────────────────
  function updatePrimaryText(idx: number, val: string) {
    setPrimaryTexts((prev) => prev.map((t, i) => (i === idx ? { ...t, body: val } : t)));
  }
  function removePrimaryText(idx: number) {
    setPrimaryTexts((prev) => prev.filter((_, i) => i !== idx));
  }
  function addPrimaryText() {
    setPrimaryTexts((prev) => [...prev, { title: "", body: "" }]);
  }

  function updateHeadline(idx: number, val: string) {
    setHeadlines((prev) => prev.map((t, i) => (i === idx ? val : t)));
  }
  function removeHeadline(idx: number) {
    setHeadlines((prev) => prev.filter((_, i) => i !== idx));
  }
  function addHeadline() {
    setHeadlines((prev) => [...prev, ""]);
  }

  function updateDescription(idx: number, val: string) {
    setDescriptions((prev) => prev.map((t, i) => (i === idx ? val : t)));
  }
  function removeDescription(idx: number) {
    setDescriptions((prev) => prev.filter((_, i) => i !== idx));
  }

  // ── Copy all ────────────────────────────────────────────────────────────
  const [copiedAll, setCopiedAll] = useState(false);
  async function copyAll() {
    const parts: string[] = [];
    if (primaryTexts.length > 0) {
      parts.push("PRIMARY TEXT OPTIONS:");
      primaryTexts.forEach((t, i) => {
        const header = t.title ? `${i + 1}. ${t.title}` : `${i + 1}.`;
        parts.push(`\n${header}\n${t.body}`);
      });
    }
    if (headlines.length > 0) {
      parts.push("\n\nHEADLINES:");
      headlines.forEach((t, i) => parts.push(`${i + 1}. ${t}`));
    }
    if (descriptions.length > 0) {
      parts.push("\n\nDESCRIPTIONS:");
      descriptions.forEach((t, i) => parts.push(`${i + 1}. ${t}`));
    }
    await navigator.clipboard.writeText(parts.join("\n"));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1500);
  }

  // ── Render ──────────────────────────────────────────────────────────────
  const showForm = hasGenerated && !isGenerating && (primaryTexts.length > 0 || headlines.length > 0);
  const hasCampaign = Boolean(selectedCampaignId);

  return (
    <div className="flex h-full w-full">
      {/* ────────────────── LEFT: Selector Panel ────────────────── */}
      <aside className="w-64 shrink-0 border-r border-border overflow-hidden flex flex-col">
        <AdCopySelector
          dateRange={dateRange}
          selectedAccountId={selectedAccountId}
          selectedCampaignId={selectedCampaignId}
          onSelect={handleSelect}
          onClear={handleClear}
        />
      </aside>

      {/* ────────────────── CENTER: Editor Panel ────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Toolbar */}
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-1.5">
            <PenTool className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium text-foreground">Ad Copy Generator</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Industry selector */}
            <div className="flex items-center gap-1.5">
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value as IndustryId)}
                className="h-7 rounded-full border bg-muted/40 px-2.5 text-[11px] font-medium text-muted-foreground outline-none focus:border-primary transition-colors"
              >
                {INDUSTRY_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              {industry === "custom" && (
                <input
                  type="text"
                  value={customIndustry}
                  onChange={(e) => setCustomIndustry(e.target.value)}
                  placeholder="Industry..."
                  maxLength={100}
                  className="h-7 w-28 rounded-full border bg-muted/40 px-2.5 text-[11px] font-medium outline-none focus:border-primary transition-colors"
                />
              )}
            </div>

            <ModelPicker model={model} onChange={setModel} disabled={isGenerating} />
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl space-y-6 p-4 pb-8">

            {/* ── Creative Grid ── */}
            {hasCampaign && creatives && creatives.length > 0 && (
              <div className="rounded-xl border bg-card/50 p-4">
                <CreativeGrid
                  creatives={creatives}
                  selectedIds={selectedCreativeIds}
                  onToggle={toggleCreative}
                  onSelectAll={selectAllCreatives}
                  onClearAll={clearAllCreatives}
                />
              </div>
            )}

            {hasCampaign && creatives && creatives.length === 0 && !creativesLoading && (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <AlertCircle className="h-8 w-8 mb-2 opacity-40" />
                <p className="text-sm">No creatives found for this campaign</p>
              </div>
            )}

            {hasCampaign && creativesLoading && (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Loading creatives...</span>
              </div>
            )}

            {/* ── Upload Images ── */}
            {hasCampaign && (
              <div className="rounded-xl border bg-card/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">
                      Upload Creative Images
                    </p>
                  </div>
                  {uploadedImages.length > 0 && (
                    <button
                      onClick={clearUploadedImages}
                      className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  Upload high-quality creative images for AI to analyze promo codes, offers, and visual details.
                </p>

                {/* Uploaded image previews */}
                {uploadedImages.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                    {uploadedImages.map((img) => (
                      <div
                        key={img.id}
                        className="group relative aspect-square overflow-hidden rounded-lg border-2 border-primary ring-1 ring-primary/30"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.preview}
                          alt={img.name}
                          className="h-full w-full object-cover"
                        />
                        <button
                          onClick={() => removeUploadedImage(img.id)}
                          className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                          <p className="text-[10px] text-white truncate leading-tight">
                            {img.name}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload button */}
                {uploadedImages.length < MAX_UPLOADS && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed py-4 transition-colors",
                      "text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5"
                    )}
                  >
                    <ImageIcon className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      {uploadedImages.length === 0
                        ? "Click to upload images"
                        : `Add more (${uploadedImages.length}/${MAX_UPLOADS})`}
                    </span>
                  </button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />

                <p className="text-[10px] text-muted-foreground">
                  JPEG, PNG, WebP, or GIF. Max 5 MB per image.
                </p>
              </div>
            )}

            {/* ── Generate button ── */}
            {hasCampaign && (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleGenerate}
                  disabled={!canGenerate || isGenerating}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all",
                    "bg-primary text-primary-foreground hover:bg-primary/90",
                    "disabled:opacity-40 disabled:cursor-not-allowed"
                  )}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate with AI
                    </>
                  )}
                </button>

                {isGenerating && (
                  <button
                    onClick={handleStop}
                    className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Square className="h-3 w-3 fill-current" />
                    Stop
                  </button>
                )}

                {hasGenerated && !isGenerating && (
                  <button
                    onClick={handleGenerate}
                    className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Regenerate
                  </button>
                )}
              </div>
            )}

            {/* ── Error ── */}
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            {/* ── Streaming indicator ── */}
            {isGenerating && streamingText && (
              <div className="rounded-xl border bg-card/50 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm font-medium text-primary">Generating ad copy...</span>
                </div>
                <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap opacity-60">
                  {streamingText.slice(-500)}
                </div>
              </div>
            )}

            {/* ── Generated form fields ── */}
            {showForm && (
              <div className="space-y-6">
                {/* Copy all button */}
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Generated Ad Copy</h3>
                  <div className="flex items-center gap-2">
                    {selectedAccountId && selectedCampaignId && (
                      <button
                        onClick={() => setDraftModalOpen(true)}
                        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                        Create Draft Ad
                      </button>
                    )}
                    <button
                      onClick={copyAll}
                      className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {copiedAll ? (
                        <><Check className="h-3 w-3 text-green-500" /> Copied!</>
                      ) : (
                        <><Copy className="h-3 w-3" /> Copy all</>
                      )}
                    </button>
                  </div>
                </div>

                {/* Primary Text section */}
                {primaryTexts.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Primary Text
                    </h4>
                    {primaryTexts.map((variation, i) => (
                      <div key={i} className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">
                          {variation.title || `Option ${i + 1}`}
                        </p>
                        <CopyableField
                          value={variation.body}
                          onChange={(val) => updatePrimaryText(i, val)}
                          onRemove={primaryTexts.length > 1 ? () => removePrimaryText(i) : undefined}
                          multiline
                        />
                      </div>
                    ))}
                    <button
                      onClick={addPrimaryText}
                      className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add text option
                    </button>
                  </div>
                )}

                {/* Headlines section */}
                {headlines.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Headlines
                    </h4>
                    {headlines.map((text, i) => (
                      <CopyableField
                        key={i}
                        value={text}
                        onChange={(val) => updateHeadline(i, val)}
                        onRemove={headlines.length > 1 ? () => removeHeadline(i) : undefined}
                      />
                    ))}
                    <button
                      onClick={addHeadline}
                      className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add headline
                    </button>
                  </div>
                )}

                {/* Descriptions section */}
                {descriptions.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Descriptions
                    </h4>
                    {descriptions.map((text, i) => (
                      <CopyableField
                        key={i}
                        value={text}
                        onChange={(val) => updateDescription(i, val)}
                        onRemove={descriptions.length > 1 ? () => removeDescription(i) : undefined}
                        multiline
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Empty state ── */}
            {!hasCampaign && !hasGenerated && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-4">
                  <PenTool className="h-7 w-7 text-primary" />
                </div>
                <h3 className="text-base font-semibold mb-1.5">AI Ad Copy Generator</h3>
                <p className="max-w-sm text-sm text-muted-foreground leading-relaxed">
                  Select an account and campaign in the left panel, then pick creatives
                  and let AI generate high-converting primary text, headlines, and descriptions.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ────────────────── RIGHT: Ad Preview ────────────────── */}
      <div className="hidden lg:flex w-[400px] shrink-0 flex-col border-l bg-muted/20">
        <AdPreview
          imageUrl={previewImageUrl}
          primaryText={primaryTexts[previewPrimaryIdx]?.body ?? ""}
          headline={headlines[previewHeadlineIdx] ?? ""}
          description={descriptions[previewDescriptionIdx] ?? ""}
          pageName={selectedAccount?.name ?? "Your Page"}
          primaryTexts={primaryTexts}
          headlines={headlines}
          descriptions={descriptions}
          previewPrimaryIdx={previewPrimaryIdx}
          previewHeadlineIdx={previewHeadlineIdx}
          previewDescriptionIdx={previewDescriptionIdx}
          onPrimaryIdxChange={setPreviewPrimaryIdx}
          onHeadlineIdxChange={setPreviewHeadlineIdx}
          onDescriptionIdxChange={setPreviewDescriptionIdx}
        />
      </div>

      {/* ────────────────── Draft Ad Modal ────────────────── */}
      {selectedAccountId && selectedCampaignId && (
        <CreateDraftModal
          open={draftModalOpen}
          onClose={() => setDraftModalOpen(false)}
          accountId={selectedAccountId}
          campaignId={selectedCampaignId}
          campaignName={selectedCampaign?.name ?? ""}
          primaryTexts={primaryTexts}
          headlines={headlines}
          descriptions={descriptions}
          primaryIdx={previewPrimaryIdx}
          headlineIdx={previewHeadlineIdx}
          descriptionIdx={previewDescriptionIdx}
          uploadedImages={uploadedImages}
          selectedCreatives={selectedCreativesData}
          allCreatives={creatives ?? []}
          dateRange={dateRange}
        />
      )}
    </div>
  );
}

// ─── Model Picker (inline) ──────────────────────────────────────────────────
function ModelPicker({
  model,
  onChange,
  disabled,
}: {
  model: ChatModelId;
  onChange: (id: ChatModelId) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = CHAT_MODELS.find((m) => m.id === model)!;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !disabled && setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        disabled={disabled}
        className={cn(
          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
          open
            ? "border-primary/50 bg-primary/10 text-primary"
            : "border-border bg-muted/40 text-muted-foreground hover:border-border hover:text-foreground",
          disabled && "cursor-not-allowed opacity-40"
        )}
      >
        <current.icon className="h-3 w-3" />
        {current.label}
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-48 rounded-xl border border-border bg-popover shadow-lg">
          <p className="border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Model
          </p>
          {CHAT_MODELS.map((m) => {
            const Icon = m.icon;
            const isActive = m.id === model;
            return (
              <button
                key={m.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(m.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                  isActive && "text-primary"
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <div className="flex-1">
                  <p className={cn("font-medium", isActive && "text-primary")}>{m.label}</p>
                  <p className="text-[10px] text-muted-foreground">{m.description}</p>
                </div>
                {isActive && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
