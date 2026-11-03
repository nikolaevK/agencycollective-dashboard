"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, CircleCheck, ExternalLink, ImageIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdSets } from "@/hooks/useAdSets";
import { META_QUERY_STALE_MS } from "@/lib/queryConfig";
import {
  adsManagerUrl,
  creativeSignature,
  draftSignature,
  idempotencyKeyFor,
  resumeFor,
  type DraftAttempt,
  type DraftContent,
} from "@/lib/adCopy/draft";
import { prepareForPublish } from "@/lib/adCopy/imageEncode";
import { charCount } from "@/lib/adCopy/limits";
import { newVariantId, pickVariant, type CopyLists } from "@/lib/adCopy/variants";
import type { CopyField, CopyVariant } from "@/lib/adCopy/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge, badgeTone } from "@/components/ui/badge";
import type { ApiResponse, DateRangeInput } from "@/types/api";

export interface DraftImageOption {
  /** "upload:<id>" | "creative:<adId>" — also the duplicate-guard identity. */
  key: string;
  label: string;
  src: string;
  kind: "upload" | "creative";
  file?: File;
  imageHash?: string | null;
  imageUrl?: string | null;
}

interface MetaPage {
  id: string;
  name: string;
}

/** GET /api/ad-copy/pages — `managed_pages` = Meta listed none for the account, so these are ALL Pages the token manages. */
interface AccountPages {
  pages: MetaPage[];
  source: "promote_pages" | "managed_pages";
}

export interface CreateDraftModalProps {
  onClose: () => void;
  accountId: string;
  campaignId: string;
  campaignName: string;
  dateRange: DateRangeInput;
  lists: CopyLists;
  initialSelected: Record<CopyField, string | null>;
  images: DraftImageOption[];
  initialImageKey: string | null;
  detectedPageId: string | null;
  defaultWebsiteUrl: string;
  attempts: DraftAttempt[];
  onAttempt: (attempt: DraftAttempt) => void;
}

const NO_DESCRIPTION = "__none";

function freshKey(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `k-${newVariantId()}`;
}

function variantLabel(v: CopyVariant, i: number): string {
  const base = v.angle?.trim() || v.text.trim().replace(/\s+/g, " ");
  return `${i + 1}. ${base.length > 48 ? `${base.slice(0, 46)}…` : base}`;
}

function titleCase(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
}

type Phase = { kind: "form" } | { kind: "submitting" } | { kind: "done"; adId: string; replayed: boolean };

export function CreateDraftModal({
  onClose,
  accountId,
  campaignId,
  campaignName,
  dateRange,
  lists,
  initialSelected,
  images,
  initialImageKey,
  detectedPageId,
  defaultWebsiteUrl,
  attempts,
  onAttempt,
}: CreateDraftModalProps) {
  const filled = (l: CopyVariant[]) => l.filter((v) => v.text.trim());
  const primaries = filled(lists.primaryText);
  const headlines = filled(lists.headline);
  const descriptions = filled(lists.description);

  const [imageKey, setImageKey] = useState(initialImageKey && images.some((i) => i.key === initialImageKey) ? initialImageKey : images[0]?.key ?? "");
  const [adsetChoice, setAdsetChoice] = useState("");
  const [pageChoice, setPageChoice] = useState(detectedPageId ?? "");
  const [choosingPage, setChoosingPage] = useState(!detectedPageId);
  const [primaryId, setPrimaryId] = useState(pickVariant(primaries, initialSelected.primaryText)?.id ?? "");
  const [headlineId, setHeadlineId] = useState(pickVariant(headlines, initialSelected.headline)?.id ?? "");
  const [descriptionId, setDescriptionId] = useState(pickVariant(descriptions, initialSelected.description)?.id ?? NO_DESCRIPTION);
  const [adName, setAdName] = useState(`${campaignName} - Draft - ${new Date().toISOString().slice(0, 10)}`.slice(0, 400));
  const [websiteUrl, setWebsiteUrl] = useState(defaultWebsiteUrl);
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  // `confirmSig`: the server refused to create this draft again after an interrupted try — only an
  // explicit confirmation (for that same draft) retries it.
  const [error, setError] = useState<{ message: string; uncertain: boolean; confirmSig?: string } | null>(null);
  const submittingRef = useRef(false);

  const { data: adSets, isLoading: adSetsLoading, isError: adSetsError } = useAdSets(campaignId, dateRange);
  const usableAdSets = useMemo(() => (adSets ?? []).filter((a) => a.status !== "DELETED" && a.status !== "ARCHIVED"), [adSets]);
  // One ad set → preselect it. A stale choice (another campaign's ad set) never survives.
  const adsetId = usableAdSets.some((a) => a.id === adsetChoice) ? adsetChoice : usableAdSets.length === 1 ? usableAdSets[0].id : "";

  // Pages are only read from Meta when the campaign's page is unknown or the person asks to change it (24h-cached).
  const pagesQuery = useQuery({
    queryKey: ["accountPages", accountId],
    queryFn: async () => {
      const res = await fetch(`/api/ad-copy/pages?accountId=${encodeURIComponent(accountId)}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json: ApiResponse<AccountPages> = await res.json();
      return json.data;
    },
    enabled: choosingPage,
    staleTime: META_QUERY_STALE_MS,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const pages = pagesQuery.data?.pages ?? [];
  const pagesFallback = pagesQuery.data?.source === "managed_pages";
  // Only this account's single eligible Page is preselected — the fallback list spans every client.
  const pageId = pageChoice || (choosingPage && !pagesFallback && pages.length === 1 ? pages[0].id : "");
  const pageName = pages.find((p) => p.id === pageId)?.name;

  const image = images.find((i) => i.key === imageKey) ?? null;
  const primary = primaries.find((v) => v.id === primaryId) ?? null;
  const headline = headlines.find((v) => v.id === headlineId) ?? null;
  const description = descriptionId === NO_DESCRIPTION ? null : descriptions.find((v) => v.id === descriptionId) ?? null;

  const content: DraftContent | null =
    image && adsetId && pageId
      ? {
          accountId,
          adsetId,
          pageId,
          imageKey: image.key,
          primaryText: primary?.text ?? "",
          headline: headline?.text ?? "",
          description: description?.text ?? "",
          websiteUrl,
        }
      : null;
  const sig = content ? draftSignature(content) : null;
  const duplicate = sig ? attempts.find((a) => a.adId && a.draftSig === sig) : undefined;
  const uncertain = sig ? attempts.find((a) => !a.adId && a.uncertain && a.draftSig === sig) : undefined;

  const missing = !image
    ? "Choose an image"
    : !adsetId
      ? "Choose an ad set"
      : !pageId
        ? "Choose a Facebook Page"
        : !primary
          ? "Choose a primary text"
          : !headline
            ? "Choose a headline"
            : !adName.trim()
              ? "Name the ad"
              : null;
  const submitting = phase.kind === "submitting";
  const confirmable = Boolean(error?.confirmSig && error.confirmSig === sig);

  async function handleSubmit(confirmRetry = false) {
    if (!content || missing || !image || submittingRef.current) return;
    submittingRef.current = true;
    setPhase({ kind: "submitting" });
    setError(null);

    // A retry of THIS draft reuses its key (the server remembers that attempt); else resume from the latest one.
    const pending = [...attempts].reverse().filter((a) => !a.adId && a.accountId === accountId);
    const prev = pending.find((a) => a.draftSig === sig) ?? pending[0] ?? null;
    const key = idempotencyKeyFor(prev, content, freshKey);
    const resume = resumeFor(prev, content);
    const base: DraftAttempt = {
      idempotencyKey: key,
      accountId,
      imageKey: image.key,
      creativeSig: creativeSignature(content),
      draftSig: draftSignature(content),
      imageHash: resume.imageHash,
      creativeId: resume.creativeId,
      adId: null,
      uncertain: false,
    };

    try {
      const payload: Record<string, unknown> = {
        accountId,
        adsetId,
        pageId,
        adName: adName.trim(),
        primaryText: content.primaryText,
        headline: content.headline,
        description: content.description,
        websiteUrl: websiteUrl.trim() || undefined,
        idempotencyKey: key,
        resume,
      };
      if (confirmRetry) payload.confirmRetry = true;
      if (resume.imageHash) payload.imageHash = resume.imageHash;
      else if (image.kind === "upload" && image.file) payload.imageBase64 = (await prepareForPublish(image.file)).base64;
      else if (image.imageHash) payload.imageHash = image.imageHash;
      else if (image.imageUrl) payload.imageUrl = image.imageUrl;

      let res: Response;
      try {
        res = await fetch("/api/ad-copy/publish-draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch {
        // The request may or may not have reached Meta. The server persists every attempt by key,
        // so a retry with the same key replays, resumes or asks — it never silently creates a second ad.
        onAttempt({ ...base, uncertain: true });
        setError({
          message: "Lost the connection while creating the draft. It may have gone through — try again to check: this attempt is remembered, so a retry won't create a second ad without asking.",
          uncertain: true,
        });
        setPhase({ kind: "form" });
        return;
      }
      const json = (await res.json().catch(() => null)) as
        | { adId?: string; replayed?: boolean; error?: string; code?: string; partial?: { imageHash?: string | null; creativeId?: string | null } }
        | null;

      if (res.ok && json?.adId) {
        onAttempt({ ...base, adId: json.adId, imageHash: null, creativeId: null });
        setPhase({ kind: "done", adId: json.adId, replayed: Boolean(json.replayed) });
        return;
      }
      // Uncertain = the server says so, the draft is still being created, or the function died /
      // timed out before answering (no JSON from a 500/502/504). Other statuses (413, 429, …) are definite.
      const isUncertain =
        json?.code === "uncertain" || json?.code === "in_progress" || (!json && (res.status === 500 || res.status === 502 || res.status === 504));
      onAttempt({
        ...base,
        imageHash: json?.partial?.imageHash ?? base.imageHash,
        creativeId: json?.partial?.creativeId ?? base.creativeId,
        uncertain: isUncertain,
      });
      setError({
        message:
          json?.error ??
          (isUncertain
            ? "The server didn't answer in time. The draft may exist — try again to check; a retry won't create a second ad without asking."
            : `Failed (${res.status}).`),
        uncertain: isUncertain,
        confirmSig: json?.code === "uncertain" ? base.draftSig : undefined,
      });
      setPhase({ kind: "form" });
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "Couldn't prepare the draft.", uncertain: false });
      setPhase({ kind: "form" });
    } finally {
      submittingRef.current = false;
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl"
        onEscapeKeyDown={(e) => submitting && e.preventDefault()}
        onPointerDownOutside={(e) => submitting && e.preventDefault()}
        showCloseButton={!submitting}
      >
        <DialogHeader>
          <DialogTitle className="font-semibold tracking-tight">Create draft ad</DialogTitle>
          <DialogDescription>
            Creates a <span className="font-medium text-foreground">paused</span> ad in {campaignName}. Nothing runs until someone turns it on in Ads Manager.
          </DialogDescription>
        </DialogHeader>

        {phase.kind === "done" ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CircleCheck className="size-10 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <div>
              <p className="font-medium">Draft ad created{phase.replayed ? " (already done — same request)" : ""}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Ad ID <span className="font-mono tabular-nums text-foreground">{phase.adId}</span> · status Paused
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <a href={adsManagerUrl(accountId, phase.adId)} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                Open in Ads Manager
              </a>
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Image */}
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-muted-foreground">Image</legend>
              {images.length > 0 ? (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Ad image">
                  {images.map((img) => {
                    const on = img.key === imageKey;
                    return (
                      <button
                        key={img.key}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={img.label}
                        title={img.label}
                        onClick={() => setImageKey(img.key)}
                        disabled={submitting}
                        className={cn(
                          "relative flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-muted outline-none ring-1 transition-all focus-visible:ring-[3px] focus-visible:ring-ring/40",
                          on ? "ring-2 ring-foreground" : "ring-foreground/10 hover:ring-foreground/30"
                        )}
                      >
                        {img.src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={img.src} alt="" className="size-full object-cover" />
                        ) : (
                          <ImageIcon className="size-5 text-muted-foreground" aria-hidden />
                        )}
                        {on && (
                          <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="size-3" strokeWidth={3} aria-hidden />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="flex items-center gap-2 rounded-2xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                  <ImageIcon className="size-4" aria-hidden />
                  No images — upload one or select a creative that has an image.
                </p>
              )}
              {image?.kind === "creative" && !image.imageHash && (
                <p className="text-xs text-muted-foreground">
                  This creative has no reusable Meta image (often a video) — its preview image will be uploaded and may be low resolution. Upload the original for best quality.
                </p>
              )}
            </fieldset>

            {/* Placement targets */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="draft-adset" className="text-xs text-muted-foreground">
                  Ad set
                </Label>
                <Select value={adsetId || undefined} onValueChange={setAdsetChoice} disabled={submitting || adSetsLoading}>
                  <SelectTrigger id="draft-adset">
                    <SelectValue placeholder={adSetsLoading ? "Loading ad sets…" : adSetsError ? "Couldn't load ad sets" : "Choose an ad set"} />
                  </SelectTrigger>
                  <SelectContent>
                    {usableAdSets.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} <span className="text-muted-foreground">· {titleCase(a.status)}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!adSetsLoading && !adSetsError && usableAdSets.length === 0 && (
                  <p className="text-xs text-muted-foreground">This campaign has no ad sets to add to.</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="draft-page" className="text-xs text-muted-foreground">
                  Facebook Page
                </Label>
                {!choosingPage && detectedPageId ? (
                  <div className="flex h-9 items-center gap-2 rounded-3xl bg-input/50 pl-3 pr-1 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {pageName ?? <span className="font-mono text-xs">{detectedPageId}</span>}
                      <span className="text-xs text-muted-foreground"> · from this campaign</span>
                    </span>
                    <Button type="button" variant="ghost" size="xs" onClick={() => setChoosingPage(true)} disabled={submitting}>
                      Change
                    </Button>
                  </div>
                ) : (
                  <Select value={pageId || undefined} onValueChange={setPageChoice} disabled={submitting || pagesQuery.isLoading}>
                    <SelectTrigger id="draft-page">
                      <SelectValue
                        placeholder={pagesQuery.isLoading ? "Loading pages…" : pagesQuery.isError ? "Couldn't load pages" : "Choose a page"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {detectedPageId && !pages.some((p) => p.id === detectedPageId) && (
                        <SelectItem value={detectedPageId}>Page {detectedPageId} · from this campaign</SelectItem>
                      )}
                      {pages.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
            {choosingPage && pagesFallback && (
              <div className={cn("flex gap-2 rounded-2xl border p-3 text-xs", badgeTone.warning)} role="status">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>
                  Meta didn&apos;t list a Page for this ad account, so this list is every Page the agency&apos;s connection manages — across all
                  clients. Pick this client&apos;s Page.
                </p>
              </div>
            )}

            {/* Copy */}
            <div className="space-y-3">
              <CopyPicker
                id="draft-primary"
                label="Primary text"
                list={primaries}
                value={primaryId}
                onChange={setPrimaryId}
                disabled={submitting}
                preview={primary?.text}
              />
              <CopyPicker id="draft-headline" label="Headline" list={headlines} value={headlineId} onChange={setHeadlineId} disabled={submitting} />
              <CopyPicker
                id="draft-description"
                label="Description"
                list={descriptions}
                value={descriptionId}
                onChange={setDescriptionId}
                disabled={submitting}
                allowNone
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="draft-name" className="text-xs text-muted-foreground">
                  Ad name
                </Label>
                <Input id="draft-name" value={adName} onChange={(e) => setAdName(e.target.value)} maxLength={400} disabled={submitting} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="draft-url" className="text-xs text-muted-foreground">
                  Website URL
                </Label>
                <Input
                  id="draft-url"
                  type="url"
                  inputMode="url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://brand.com/offer"
                  disabled={submitting}
                />
              </div>
            </div>
            {!websiteUrl.trim() && (
              <p className="text-xs text-muted-foreground">Without a website URL Meta may reject a link ad — add the landing page if you have it.</p>
            )}

            {duplicate && (
              <div className={cn("flex gap-2 rounded-2xl border p-3 text-xs", badgeTone.warning)} role="status">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>
                  You already created this exact draft (ad <span className="font-mono">{duplicate.adId}</span>). Creating it again adds a second paused ad.
                </p>
              </div>
            )}
            {uncertain && !error && (
              <div className={cn("flex gap-2 rounded-2xl border p-3 text-xs", badgeTone.warning)} role="status">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>
                  The last try may have created this ad.{" "}
                  <a className="underline underline-offset-2" href={adsManagerUrl(accountId)} target="_blank" rel="noopener noreferrer">
                    Check Ads Manager
                  </a>
                  , or try again — the retry checks first and won&apos;t create a second ad without asking.
                </p>
              </div>
            )}
            {error && (
              <div
                className={cn("flex gap-2 rounded-2xl border p-3 text-sm", error.uncertain ? badgeTone.warning : badgeTone.danger)}
                role="alert"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>
                  {error.message}
                  {confirmable && (
                    <>
                      {" "}
                      <a className="underline underline-offset-2" href={adsManagerUrl(accountId)} target="_blank" rel="noopener noreferrer">
                        Open Ads Manager
                      </a>
                    </>
                  )}
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {phase.kind === "done" ? (
            <>
              <Button type="button" variant="outline" onClick={() => setPhase({ kind: "form" })}>
                Create another
              </Button>
              <Button type="button" onClick={onClose}>
                Done
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void handleSubmit(confirmable)}
                disabled={Boolean(missing) || submitting}
                title={missing ?? undefined}
              >
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Creating…
                  </>
                ) : confirmable ? (
                  "I checked Ads Manager — create it anyway"
                ) : duplicate ? (
                  "Create another copy"
                ) : error || uncertain ? (
                  "Try again"
                ) : (
                  "Create draft ad"
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CopyPicker({
  id,
  label,
  list,
  value,
  onChange,
  disabled,
  preview,
  allowNone,
}: {
  id: string;
  label: string;
  list: CopyVariant[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  preview?: string;
  allowNone?: boolean;
}) {
  const current = list.find((v) => v.id === value);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id} className="text-xs text-muted-foreground">
          {label}
        </Label>
        {current && <span className="text-[11px] tabular-nums text-muted-foreground">{charCount(current.text)} chars</span>}
      </div>
      {list.length === 0 && !allowNone ? (
        <StatusBadge tone="warning">No {label.toLowerCase()} yet — add one in the editor</StatusBadge>
      ) : (
        <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger id={id}>
            <SelectValue placeholder={`Choose a ${label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {allowNone && <SelectItem value={NO_DESCRIPTION}>No {label.toLowerCase()}</SelectItem>}
            {list.map((v, i) => (
              <SelectItem key={v.id} value={v.id}>
                {variantLabel(v, i)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {preview && (
        <p className="line-clamp-4 whitespace-pre-wrap rounded-2xl bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">{preview}</p>
      )}
    </div>
  );
}
