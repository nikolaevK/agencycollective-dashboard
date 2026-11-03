"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, Check, Copy, Eye, ListFilter, Loader2, PenTool, Plus } from "lucide-react";
import { cn, formatCurrency, formatRoas } from "@/lib/utils";
import { useDateRange } from "@/hooks/useDateRange";
import { useAccounts } from "@/hooks/useAccounts";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useCampaignCreatives } from "@/hooks/useCampaignCreatives";
import { useToast } from "@/components/providers/ToastProvider";
import { DEFAULT_MODEL, type ChatModelId } from "@/lib/chatModels";
import { DEFAULT_SETTINGS } from "@/lib/adCopy/settings";
import { prepareForAnalysis } from "@/lib/adCopy/imageEncode";
import { normalizeAdCopy } from "@/lib/adCopy/normalize";
import {
  EMPTY_LISTS,
  formatCopyAll,
  mergeFullResult,
  newVariantId,
  pinnedCopy,
  replaceVariant,
  undoVariant,
  variantRequest,
  type CopyLists,
} from "@/lib/adCopy/variants";
import type { DraftAttempt } from "@/lib/adCopy/draft";
import type { AdCopyCreative, AdCopyResult, CopyField, CopyVariant, GenerationSettings } from "@/lib/adCopy/types";
import { Badge, StatusBadge, badgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useConfirm } from "@/components/ui/use-confirm";
import { AdCopySelector } from "./AdCopySelector";
import { CreativeGrid } from "./CreativeGrid";
import { UploadZone, type UploadItem } from "./UploadZone";
import { BriefCard } from "./BriefCard";
import { CopyEditor } from "./CopyEditor";
import { AdPreview, type PreviewImageOption } from "./AdPreview";
import { useAdCopyStream, type GenState } from "./useAdCopyStream";
import type { DraftImageOption } from "./CreateDraftModal";

// Behind a click — kept out of the panel's first chunk.
const CreateDraftModal = dynamic(() => import("./CreateDraftModal").then((m) => m.CreateDraftModal), { ssr: false });
const PanelSheet = dynamic(() => import("./PanelSheet").then((m) => m.PanelSheet), { ssr: false });

const MAX_CREATIVES = 10;
const MAX_UPLOADS = 10;
const NO_SELECTION: Record<CopyField, string | null> = { primaryText: null, headline: null, description: null };

function hasAnyCopy(lists: CopyLists): boolean {
  return lists.primaryText.length + lists.headline.length + lists.description.length > 0;
}

function resultHasContent(r: AdCopyResult | null): r is AdCopyResult {
  return Boolean(r && (r.primaryTexts.length || r.headlines.length || r.descriptions.length));
}

/** `active` = this tool's Creative Studio tab is showing (panels stay mounted while hidden). */
export function AdCopyGenerator({ active = true }: { active?: boolean } = {}) {
  const { dateRange } = useDateRange();
  const { toast } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const gen = useAdCopyStream();

  // ── Selection ───────────────────────────────────────────────────────────
  const [accountId, setAccountId] = useState<string | undefined>();
  const [campaignId, setCampaignId] = useState<string | undefined>();
  const [selectedCreativeIds, setSelectedCreativeIds] = useState<Set<string>>(new Set());

  // ── Uploads (object URLs revoked on remove + unmount) ───────────────────
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [processing, setProcessing] = useState(0);
  const uploadsRef = useRef(uploads);
  uploadsRef.current = uploads;
  useEffect(() => () => uploadsRef.current.forEach((u) => URL.revokeObjectURL(u.previewUrl)), []);

  // ── Brief ───────────────────────────────────────────────────────────────
  const [settings, setSettings] = useState<GenerationSettings>(DEFAULT_SETTINGS);
  const [model, setModel] = useState<ChatModelId>(DEFAULT_MODEL);
  const [landingUrl, setLandingUrl] = useState("");

  // ── Generated copy ──────────────────────────────────────────────────────
  const [lists, setLists] = useState<CopyLists>(EMPTY_LISTS);
  const [offers, setOffers] = useState<string[]>([]);
  const [selected, setSelected] = useState<Record<CopyField, string | null>>(NO_SELECTION);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  // ── Preview / draft / mobile panels ─────────────────────────────────────
  const [previewImageKey, setPreviewImageKey] = useState<string | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);
  const [attempts, setAttempts] = useState<DraftAttempt[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // ── Data ────────────────────────────────────────────────────────────────
  const { data: accounts } = useAccounts(dateRange);
  const { data: campaigns } = useCampaigns(accountId, dateRange);
  const {
    data: creativesRaw,
    isLoading: creativesLoading,
    isError: creativesError,
  } = useCampaignCreatives(accountId, campaignId, dateRange);
  const creatives = creativesRaw as AdCopyCreative[] | undefined;

  const account = accounts?.find((a) => a.id === accountId);
  const campaign = campaigns?.find((c) => c.id === campaignId);
  const selectedCreatives = useMemo(
    () => (creatives ?? []).filter((c) => selectedCreativeIds.has(c.adId)),
    [creatives, selectedCreativeIds]
  );

  // Images the preview + draft can use: uploads first, then selected creatives with an image.
  const imageOptions = useMemo<DraftImageOption[]>(() => {
    const out: DraftImageOption[] = uploads.map((u) => ({ key: `upload:${u.id}`, label: u.name, src: u.previewUrl, kind: "upload", file: u.file }));
    for (const c of selectedCreatives) {
      const src = c.imageUrl ?? c.thumbnailUrl;
      if (!src && !c.imageHash) continue;
      out.push({ key: `creative:${c.adId}`, label: c.adName, src: src ?? "", kind: "creative", imageHash: c.imageHash, imageUrl: c.imageUrl });
    }
    return out;
  }, [uploads, selectedCreatives]);
  const previewImages: PreviewImageOption[] = useMemo(() => {
    const opts = imageOptions.filter((o) => o.src).map((o) => ({ key: o.key, label: o.label, src: o.src }));
    // Nothing chosen yet: preview the campaign's top creative so the mock isn't blank.
    if (opts.length === 0 && creatives?.[0]?.imageUrl) opts.push({ key: `creative:${creatives[0].adId}`, label: creatives[0].adName, src: creatives[0].imageUrl });
    return opts;
  }, [imageOptions, creatives]);

  const detectedPageId = useMemo(() => {
    for (const c of [...selectedCreatives, ...(creatives ?? [])]) if (c.pageId) return c.pageId;
    return null;
  }, [selectedCreatives, creatives]);
  const existingLink = useMemo(() => {
    for (const c of [...selectedCreatives, ...(creatives ?? [])]) if (c.existingLink) return c.existingLink;
    return "";
  }, [selectedCreatives, creatives]);

  // Bumped when the campaign changes/clears: a generation that finishes (or is
  // stopped) after that must not write the old campaign's copy into the new one.
  const epochRef = useRef(0);

  const running = gen.state.running;
  const hasCopy = hasAnyCopy(lists);
  const pinnedCount = [...lists.primaryText, ...lists.headline, ...lists.description].filter((v) => v.pinned).length;
  const inputCount = selectedCreatives.length + uploads.length;
  const disabledReason = !campaign
    ? "Pick a campaign first"
    : processing > 0
      ? "Preparing images…"
      : inputCount === 0
        ? "Select creatives or upload images"
        : settings.industry === "custom" && !settings.customIndustry?.trim()
          ? "Name the custom industry"
          : null;
  const canGenerate = !disabledReason && !running;

  // ── Selection handlers ──────────────────────────────────────────────────
  const resetCopy = useCallback(() => {
    setLists(EMPTY_LISTS);
    setOffers([]);
    setSelected(NO_SELECTION);
    setError(null);
    setNotice(null);
  }, []);

  async function handleSelect(nextAccount: string, nextCampaign: string) {
    if (nextAccount === accountId && nextCampaign === campaignId) {
      setPickerOpen(false);
      return;
    }
    if (hasCopy || running) {
      const ok = await confirm({
        title: "Switch campaign?",
        description: "The generated copy for this campaign will be cleared. Uploaded images stay.",
        confirmText: "Switch",
      });
      if (!ok) return;
    }
    epochRef.current++;
    gen.stop();
    setAccountId(nextAccount);
    setCampaignId(nextCampaign);
    setSelectedCreativeIds(new Set());
    setPreviewImageKey(null);
    resetCopy();
    setPickerOpen(false);
  }

  async function handleClear() {
    if (hasCopy || running) {
      const ok = await confirm({ title: "Clear the selection?", description: "The generated copy will be cleared too.", confirmText: "Clear" });
      if (!ok) return;
    }
    epochRef.current++;
    gen.stop();
    setAccountId(undefined);
    setCampaignId(undefined);
    setSelectedCreativeIds(new Set());
    setPreviewImageKey(null);
    resetCopy();
  }

  // Stable handlers: CreativeGrid / CopyEditor / AdPreview are memoized and skip the stream's re-renders.
  const toggleCreative = useCallback((adId: string) => {
    setSelectedCreativeIds((prev) => {
      const next = new Set(prev);
      if (next.has(adId)) next.delete(adId);
      else if (next.size < MAX_CREATIVES) next.add(adId);
      return next;
    });
  }, []);
  const selectCreatives = useCallback((ids: string[]) => setSelectedCreativeIds(new Set(ids.slice(0, MAX_CREATIVES))), []);
  const clearCreatives = useCallback(() => setSelectedCreativeIds(new Set()), []);

  // ── Uploads ─────────────────────────────────────────────────────────────
  const addFiles = useCallback(
    async (files: File[]) => {
      const room = MAX_UPLOADS - uploadsRef.current.length;
      const images = files.filter((f) => f.type.startsWith("image/") || f.type === "");
      if (images.length === 0) {
        toast("Only image files can be added.");
        return;
      }
      if (room <= 0) {
        toast(`Up to ${MAX_UPLOADS} images.`);
        return;
      }
      const batch = images.slice(0, room);
      if (images.length > room) toast(`Only ${room} more image${room === 1 ? "" : "s"} fit — the rest were skipped.`);
      setProcessing((n) => n + batch.length);
      const prepared = await Promise.all(
        batch.map(async (file) => {
          try {
            const analysis = await prepareForAnalysis(file);
            return {
              id: newVariantId(),
              name: file.name || "pasted image",
              previewUrl: URL.createObjectURL(file),
              file,
              analysis: { base64: analysis.base64, mediaType: analysis.mediaType, width: analysis.width, height: analysis.height },
            } satisfies UploadItem;
          } catch (err) {
            toast(err instanceof Error ? err.message : `${file.name} couldn't be added.`);
            return null;
          }
        })
      );
      setProcessing((n) => n - batch.length);
      const ok = prepared.filter((p): p is UploadItem => p !== null);
      setUploads((prev) => {
        const next = [...prev, ...ok];
        next.slice(MAX_UPLOADS).forEach((u) => URL.revokeObjectURL(u.previewUrl));
        return next.slice(0, MAX_UPLOADS);
      });
    },
    [toast]
  );

  function removeUpload(id: string) {
    setUploads((prev) => {
      const gone = prev.find((u) => u.id === id);
      if (gone) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((u) => u.id !== id);
    });
  }

  function clearUploads() {
    uploads.forEach((u) => URL.revokeObjectURL(u.previewUrl));
    setUploads([]);
  }

  // ── Generation ──────────────────────────────────────────────────────────
  function requestBase() {
    return {
      selectedCreatives: selectedCreatives.map((c) => ({
        adId: c.adId,
        adName: c.adName,
        imageUrl: c.imageUrl,
        existingPrimaryText: c.existingPrimaryText,
        existingHeadline: c.existingHeadline,
        existingDescription: c.existingDescription,
        spend: c.spend,
        ctr: c.ctr,
      })),
      uploadedImages: uploads.map((u) => ({ name: u.name, base64: u.analysis.base64, mediaType: u.analysis.mediaType })),
      campaignName: campaign?.name ?? "",
      campaignObjective: campaign?.objective,
      campaignSpend: campaign?.insights.spend,
      campaignRoas: campaign?.insights.roas,
      model,
      settings,
    };
  }

  function applyFull(result: AdCopyResult) {
    setLists((prev) => mergeFullResult(prev, result));
    if (result.detectedOffers.length) setOffers(result.detectedOffers);
    setSelected(NO_SELECTION);
  }

  async function handleGenerate() {
    if (!canGenerate || !campaign) return;
    setError(null);
    setNotice(null);
    const epoch = epochRef.current;
    const outcome = await gen.run({ ...requestBase(), mode: { kind: "full", keep: pinnedCopy(lists) } }, { kind: "full" });
    if (epoch !== epochRef.current) return;
    if (outcome.ok) {
      applyFull(outcome.result);
      const notes: string[] = [];
      if (outcome.imagesSkipped > 0) notes.push(`${outcome.imagesSkipped} creative image${outcome.imagesSkipped === 1 ? "" : "s"} couldn't be loaded — Claude used their copy and stats only.`);
      if (outcome.fallback) notes.push(`Written by ${outcome.fallback.to} after ${outcome.fallback.from} declined part of the request.`);
      setNotice(notes.join(" ") || null);
      return;
    }
    // A partial is kept only when there's no copy to overwrite — Stop during "Regenerate all"
    // leaves the existing (maybe hand-edited) variants alone — and is normalized like a full result.
    const kept = outcome.partial && !hasCopy ? normalizeAdCopy(outcome.partial) : null;
    if (outcome.code === "aborted") {
      if (resultHasContent(kept)) {
        applyFull(kept);
        toast("Stopped — kept what was written so far.", "success");
      }
      return;
    }
    // A cut-off or dropped stream keeps what arrived; a refusal's partial output is discarded.
    if ((outcome.code === "max_tokens" || outcome.code === "upstream") && resultHasContent(kept)) {
      applyFull(kept);
    }
    setError(outcome.message);
  }

  async function handleRegenerate(field: CopyField, id: string) {
    if (running || !campaign || inputCount === 0) return;
    const req = variantRequest(lists, field, id);
    if (!req) return;
    setError(null);
    const epoch = epochRef.current;
    const outcome = await gen.run(
      { ...requestBase(), mode: { kind: "variant", field, index: req.index, current: req.current } },
      { kind: "variant", field, id }
    );
    if (epoch !== epochRef.current) return;
    if (!outcome.ok) {
      if (outcome.code !== "aborted") setError(outcome.message);
      return;
    }
    const r = outcome.result;
    const item =
      field === "primaryText"
        ? r.primaryTexts[0]
        : field === "headline"
          ? r.headlines[0] && { text: r.headlines[0], angle: undefined }
          : r.descriptions[0] && { text: r.descriptions[0], angle: undefined };
    if (!item || !item.text) {
      setError("Claude didn't return a replacement — try again.");
      return;
    }
    setLists((prev) => ({ ...prev, [field]: replaceVariant(prev[field], id, item.text, item.angle) }));
  }

  // Keyboard + paste — inert while the tab is hidden (the panel stays mounted).
  const generateRef = useRef(handleGenerate);
  generateRef.current = handleGenerate;
  const regenerateRef = useRef(handleRegenerate);
  regenerateRef.current = handleRegenerate;
  const regenerate = useCallback((field: CopyField, id: string) => void regenerateRef.current(field, id), []);
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (draftOpen) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !e.repeat) {
        e.preventDefault();
        void generateRef.current();
      }
    };
    const onPaste = (e: ClipboardEvent) => {
      if (!campaignId || draftOpen) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (files.length === 0) return;
      e.preventDefault();
      void addFiles(files);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("paste", onPaste);
    };
  }, [active, campaignId, draftOpen, addFiles]);

  // ── Editing ─────────────────────────────────────────────────────────────
  const editVariant = useCallback((field: CopyField, id: string, patch: Partial<CopyVariant>) => {
    setLists((prev) => ({ ...prev, [field]: prev[field].map((v) => (v.id === id ? { ...v, ...patch } : v)) }));
  }, []);
  const removeVariant = useCallback((field: CopyField, id: string) => {
    setLists((prev) => ({ ...prev, [field]: prev[field].filter((v) => v.id !== id) }));
    setSelected((s) => (s[field] === id ? { ...s, [field]: null } : s));
  }, []);
  const addVariant = useCallback((field: CopyField) => {
    const v: CopyVariant = { id: newVariantId(), text: "", ...(field === "primaryText" ? { angle: "" } : {}) };
    setLists((prev) => ({ ...prev, [field]: [...prev[field], v] }));
  }, []);
  const selectVariant = useCallback((field: CopyField, id: string) => {
    setSelected((s) => ({ ...s, [field]: id }));
  }, []);
  const undoRewrite = useCallback((field: CopyField, id: string) => setLists((prev) => ({ ...prev, [field]: undoVariant(prev[field], id) })), []);

  const copyText = useCallback(
    async (key: string, text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedKey(key);
        clearTimeout(copiedTimer.current);
        copiedTimer.current = setTimeout(() => setCopiedKey(null), 1500);
      } catch {
        toast("Couldn't copy — your browser blocked clipboard access.");
      }
    },
    [toast]
  );
  const copyVariant = useCallback((key: string, text: string) => void copyText(key, text), [copyText]);

  function recordAttempt(a: DraftAttempt) {
    setAttempts((prev) => [...prev.filter((p) => p.idempotencyKey !== a.idempotencyKey), a].slice(-30));
  }

  const preview = (
    <AdPreview
      images={previewImages}
      imageKey={previewImageKey}
      onImageChange={setPreviewImageKey}
      primaryTexts={lists.primaryText}
      headlines={lists.headline}
      descriptions={lists.description}
      selected={selected}
      onSelect={selectVariant}
      pageName={account?.name ?? "Your Page"}
      websiteUrl={landingUrl || existingLink}
    />
  );

  const selector = (
    <AdCopySelector
      dateRange={dateRange}
      selectedAccountId={accountId}
      selectedCampaignId={campaignId}
      onSelect={handleSelect}
      onClear={handleClear}
    />
  );

  const fullRunning = running && gen.state.target?.kind === "full";
  const regeneratingId = running && gen.state.target?.kind === "variant" ? gen.state.target.id : null;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-0 flex-1 gap-4 lg:gap-6">
        {/* Left: campaign picker (lg+; a sheet below) */}
        <Card className="hidden w-72 shrink-0 flex-col lg:flex">{selector}</Card>

        {/* Center: creatives, brief, copy */}
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {/* gap, not space-y: the hidden (display:none) toolbars would still offset the first card. */}
          <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-6">
            <div className="flex items-center gap-2 lg:hidden">
              <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)} className="min-w-0 flex-1 justify-start">
                <ListFilter />
                <span className="truncate">{campaign?.name ?? "Choose a campaign"}</span>
              </Button>
              {campaign && (
                <Button type="button" variant="outline" size="sm" onClick={() => setPreviewOpen(true)} className="xl:hidden">
                  <Eye />
                  Preview
                </Button>
              )}
            </div>
            {campaign && (
              <div className="hidden justify-end lg:flex xl:hidden">
                <Button type="button" variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
                  <Eye />
                  Preview
                </Button>
              </div>
            )}

            {!campaignId ? (
              <Card className="flex flex-col items-center px-6 py-14 text-center">
                <PenTool className="size-8 text-muted-foreground" aria-hidden />
                <p className="mt-3 text-base font-semibold tracking-tight">Write ad copy from your live creatives</p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  Pick a campaign, choose the creatives to learn from (or upload originals), and Claude writes primary text, headlines and
                  descriptions you can edit, preview and publish as a paused draft.
                </p>
                <Button type="button" className="mt-5 lg:hidden" onClick={() => setPickerOpen(true)}>
                  Choose a campaign
                </Button>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader className="pb-4 md:pb-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs text-muted-foreground">{account?.name}</p>
                        <CardTitle className="truncate font-semibold tracking-tight" title={campaign?.name}>
                          {campaign?.name ?? "Campaign"}
                        </CardTitle>
                      </div>
                      {campaign && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge tone={campaign.status === "ACTIVE" ? "success" : "neutral"}>
                            {campaign.status.charAt(0) + campaign.status.slice(1).toLowerCase()}
                          </StatusBadge>
                          <Badge variant="outline" className="tabular-nums">
                            {formatCurrency(campaign.insights.spend)}
                          </Badge>
                          <Badge variant="outline" className="tabular-nums">
                            {formatRoas(campaign.insights.roas)} ROAS
                          </Badge>
                        </div>
                      )}
                    </div>
                    <CardDescription>Choose up to {MAX_CREATIVES} creatives for Claude to read — their images, live copy and results.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {creativesLoading ? (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                        {Array.from({ length: 8 }, (_, i) => (
                          <Skeleton key={i} className="aspect-[4/5] w-full" />
                        ))}
                      </div>
                    ) : creativesError ? (
                      <p className="rounded-2xl bg-muted/50 px-3 py-6 text-center text-sm text-muted-foreground">
                        Couldn&apos;t load this campaign&apos;s creatives. Upload images instead, or try another campaign.
                      </p>
                    ) : creatives && creatives.length > 0 ? (
                      <CreativeGrid
                        creatives={creatives}
                        selectedIds={selectedCreativeIds}
                        onToggle={toggleCreative}
                        onSelectMany={selectCreatives}
                        onClearAll={clearCreatives}
                        maxSelection={MAX_CREATIVES}
                      />
                    ) : (
                      <p className="rounded-2xl bg-muted/50 px-3 py-6 text-center text-sm text-muted-foreground">
                        No ads in this campaign for the selected period — upload images below.
                      </p>
                    )}
                    <UploadZone
                      uploads={uploads}
                      processing={processing}
                      max={MAX_UPLOADS}
                      onAddFiles={(f) => void addFiles(f)}
                      onRemove={removeUpload}
                      onClear={clearUploads}
                    />
                  </CardContent>
                </Card>

                <BriefCard
                  settings={settings}
                  onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))}
                  model={model}
                  onModelChange={setModel}
                  landingUrl={landingUrl}
                  onLandingUrlChange={setLandingUrl}
                  canGenerate={canGenerate}
                  disabledReason={disabledReason}
                  running={running}
                  hasCopy={hasCopy}
                  pinnedCount={pinnedCount}
                  onGenerate={() => void handleGenerate()}
                  onStop={gen.stop}
                />

                {error && (
                  <div className={cn("flex gap-2 rounded-2xl border p-3 text-sm", badgeTone.danger)} role="alert">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <p>{error}</p>
                  </div>
                )}
                {notice && !error && <p className="px-1 text-xs text-muted-foreground">{notice}</p>}

                {fullRunning && <StreamingCard state={gen.state} />}

                {!fullRunning && hasCopy && (
                  <>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => void copyText("all", formatCopyAll(lists))}>
                        {copiedKey === "all" ? <Check /> : <Copy />}
                        {copiedKey === "all" ? "Copied" : "Copy all"}
                      </Button>
                      <Button type="button" size="sm" onClick={() => setDraftOpen(true)} disabled={running}>
                        <Plus />
                        Create draft ad
                      </Button>
                    </div>
                    <CopyEditor
                      lists={lists}
                      offers={offers}
                      selected={selected}
                      busy={running}
                      regeneratingId={regeneratingId}
                      copiedKey={copiedKey}
                      onEdit={editVariant}
                      onRemove={removeVariant}
                      onAdd={addVariant}
                      onSelect={selectVariant}
                      onRegenerate={regenerate}
                      onUndo={undoRewrite}
                      onCopy={copyVariant}
                    />
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right: live preview (xl+; a sheet below) */}
        <Card className="hidden w-[380px] shrink-0 flex-col xl:flex">{preview}</Card>
      </div>

      {pickerOpen && (
        <PanelSheet open={pickerOpen} onOpenChange={setPickerOpen} side="left" title="Campaign" description="Pick an account and campaign">
          {selector}
        </PanelSheet>
      )}
      {previewOpen && (
        <PanelSheet open={previewOpen} onOpenChange={setPreviewOpen} side="right" title="Ad preview" description="Preview the selected copy">
          {preview}
        </PanelSheet>
      )}
      {draftOpen && accountId && campaignId && (
        <CreateDraftModal
          onClose={() => setDraftOpen(false)}
          accountId={accountId}
          campaignId={campaignId}
          campaignName={campaign?.name ?? "Campaign"}
          dateRange={dateRange}
          lists={lists}
          initialSelected={selected}
          images={imageOptions.filter((o) => o.src || o.imageHash)}
          initialImageKey={previewImageKey}
          detectedPageId={detectedPageId}
          defaultWebsiteUrl={landingUrl || existingLink}
          attempts={attempts}
          onAttempt={recordAttempt}
        />
      )}
      {confirmDialog}
    </TooltipProvider>
  );
}

const PHASE_LABEL: Record<GenState["phase"], string> = {
  idle: "Starting…",
  images: "Loading creative images…",
  thinking: "Reading the creatives…",
  writing: "Writing copy…",
};

/** Live view of a full generation: phase, Claude's thinking summary, and variants as they stream in. */
function StreamingCard({ state }: { state: GenState }) {
  const p = state.partial;
  return (
    <Card aria-busy="true">
      <CardHeader className="pb-3 md:pb-3">
        <div className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
          {/* Only the phase is announced — the streamed copy below changes every 120 ms. */}
          <CardTitle aria-live="polite" className="text-sm font-semibold tracking-tight">
            {PHASE_LABEL[state.phase]}
          </CardTitle>
        </div>
        {state.fallback && (
          <CardDescription>
            Continuing on {state.fallback.to} — {state.fallback.from} declined part of the request.
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {state.thinking && !p && (
          <p className="line-clamp-4 whitespace-pre-wrap text-xs italic text-muted-foreground">{state.thinking.trim()}</p>
        )}
        {p ? (
          <div className="space-y-4">
            {p.detectedOffers.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {p.detectedOffers.map((o) => (
                  <Badge key={o} variant="outline" className="font-mono">
                    {o}
                  </Badge>
                ))}
              </div>
            )}
            {p.primaryTexts.map((t, i) => (
              <div key={i} className="space-y-1 rounded-2xl p-3 ring-1 ring-foreground/10">
                {t.angle && <p className="text-xs font-medium text-muted-foreground">{t.angle}</p>}
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{t.text}</p>
              </div>
            ))}
            {p.headlines.length > 0 && (
              <ul className="space-y-1 text-sm font-medium" role="list">
                {p.headlines.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            )}
            {p.descriptions.length > 0 && (
              <ul className="space-y-1 text-sm text-muted-foreground" role="list">
                {p.descriptions.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
