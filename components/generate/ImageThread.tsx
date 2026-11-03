"use client";

import { memo, useEffect, useState } from "react";
import { Copy, Download, GitBranch, ImageIcon, ImageOff, ImagePlus, Info, Loader2, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { geminiImageModelInfo, imageSizeLabel } from "@/lib/geminiModels";
import type { GenerateMessage, GenerateSettings, ImageRef } from "@/hooks/useImageGeneratorSession";
import { Badge, badgeTone, badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytes, formatElapsed, formatLabel } from "./generateClient";

const STARTER_PROMPTS = [
  "Generate a cinematic sunset over mountain peaks",
  "Create a minimal product photo on a white background with soft studio light",
  "Design a vibrant abstract gradient artwork",
  "Make a professional portrait with studio lighting",
];

export interface ImageActions {
  urlFor: (id: string) => string | null;
  onOpen: (image: ImageRef, prompt: string | null) => void;
  onDownload: (image: ImageRef, prompt: string | null, index: number) => void;
  onCopy: (image: ImageRef) => void;
  onUseAsReference: (image: ImageRef) => void;
  /** Branch: the next message continues from this image (multi-turn). null = not offered. */
  onEditFrom: ((image: ImageRef) => void) | null;
  onImageLoad: () => void;
}

export interface PendingTurn {
  startedAt: number;
  stage: "preparing" | "generating" | "retrying";
  settings: GenerateSettings;
}

function cssRatio(ratio: string | null): string {
  if (!ratio) return "1 / 1";
  const [w, h] = ratio.split(":").map(Number);
  return w > 0 && h > 0 ? `${w} / ${h}` : "1 / 1";
}

function SettingsBadges({ settings, align }: { settings: GenerateSettings; align: "start" | "end" }) {
  return (
    <div className={cn("flex flex-wrap gap-1", align === "end" ? "justify-end" : "justify-start")}>
      <Badge variant="outline" className="font-normal text-muted-foreground">
        {geminiImageModelInfo(settings.model).label}
      </Badge>
      <Badge variant="outline" className="font-normal text-muted-foreground">
        {imageSizeLabel(settings.resolution)}
      </Badge>
      {settings.aspectRatio && (
        <Badge variant="outline" className="font-normal text-muted-foreground">
          {settings.aspectRatio}
        </Badge>
      )}
      {settings.mode === "single-turn" && (
        <Badge variant="outline" className="font-normal text-muted-foreground">
          Single-turn
        </Badge>
      )}
    </div>
  );
}

function GeneratedImage({
  image,
  index,
  prompt,
  isLatest,
  missing,
  actions,
}: {
  image: ImageRef;
  index: number;
  prompt: string | null;
  isLatest: boolean;
  missing: boolean;
  actions: ImageActions;
}) {
  const url = missing ? null : actions.urlFor(image.id);
  const alt = prompt ? `Generated: ${prompt.slice(0, 120)}` : "Generated image";
  const meta = [
    formatLabel(image.mimeType),
    image.width && image.height ? `${image.width}×${image.height}` : null,
    formatBytes(image.bytes),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <figure className="overflow-hidden rounded-3xl bg-muted/40 ring-1 ring-foreground/10">
      {url ? (
        <button
          type="button"
          onClick={() => actions.onOpen(image, prompt)}
          className="block w-full cursor-zoom-in outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/30"
          aria-label="Open full size"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
          <img
            src={url}
            alt={alt}
            onLoad={actions.onImageLoad}
            className="mx-auto block max-h-[min(60vh,560px)] w-auto max-w-full object-contain"
          />
        </button>
      ) : (
        <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
          <ImageOff className="size-6" />
          {missing ? "This image is no longer stored in this browser." : "Loading image…"}
        </div>
      )}
      <figcaption className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t px-3 py-2">
        <span className="text-xs text-muted-foreground">{meta}</span>
        {url && (
          <div className="ml-auto flex items-center gap-0.5">
            {actions.onEditFrom && !isLatest && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Continue editing from this image"
                title="Continue editing from this image"
                onClick={() => actions.onEditFrom?.(image)}
              >
                <GitBranch />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Use as reference image"
              title="Use as reference image"
              onClick={() => actions.onUseAsReference(image)}
            >
              <ImagePlus />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Copy image"
              title="Copy image"
              onClick={() => actions.onCopy(image)}
            >
              <Copy />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Open full size"
              title="Open full size"
              onClick={() => actions.onOpen(image, prompt)}
            >
              <Maximize2 />
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => actions.onDownload(image, prompt, index)}>
              <Download />
              Download
            </Button>
          </div>
        )}
      </figcaption>
    </figure>
  );
}

/** The turn in flight. Owns the per-second timer, so ticking never re-renders the thread. */
function PendingStatus({ pending, active }: { pending: PendingTurn; active: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  return (
    <div className="flex flex-col items-start gap-2">
      <Skeleton
        className="max-h-[420px] w-full max-w-md rounded-3xl"
        style={{ aspectRatio: cssRatio(pending.settings.aspectRatio) }}
      />
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        {/* Announce stage changes only — not every tick of the timer. */}
        <span aria-live="polite">
          {pending.stage === "preparing"
            ? "Preparing images…"
            : pending.stage === "retrying"
              ? "Gemini was busy — retrying…"
              : `Generating with ${geminiImageModelInfo(pending.settings.model).label}…`}
        </span>
        <span className="tabular-nums" aria-hidden>
          {formatElapsed(now - pending.startedAt)}
        </span>
      </div>
    </div>
  );
}

function hostname(uri: string): string {
  try {
    return new URL(uri).hostname.replace(/^www\./, "");
  } catch {
    return uri;
  }
}

/** Memoized: re-renders only when one of these props changes (not on composer keystrokes). */
export const ImageThread = memo(function ImageThread({
  messages,
  pending,
  active,
  latestImageId,
  missing,
  actions,
  onStarter,
}: {
  messages: GenerateMessage[];
  pending: PendingTurn | null;
  /** The Creative Studio tab is showing — the pending timer only ticks then. */
  active: boolean;
  latestImageId: string | null;
  missing: ReadonlySet<string>;
  actions: ImageActions;
  onStarter: (prompt: string) => void;
  /** Bumped when stored images finish loading (actions.urlFor answers more ids). */
  imagesVersion: number;
}) {
  if (messages.length === 0 && !pending) {
    return (
      <div className="m-auto flex w-full max-w-md flex-col items-center gap-5 px-4 py-10 text-center">
        <ImageIcon className="size-8 text-muted-foreground" aria-hidden />
        <div className="space-y-1">
          <h3 className="text-base font-semibold tracking-tight">Describe an image to create</h3>
          <p className="text-sm text-muted-foreground">
            Start from a prompt, or attach up to 4 reference images (paste or drop them here) to edit or combine.
          </p>
        </div>
        <div className="grid w-full gap-2">
          {STARTER_PROMPTS.map((p) => (
            <Button
              key={p}
              type="button"
              variant="outline"
              className="h-auto justify-start whitespace-normal rounded-2xl px-4 py-2.5 text-left font-normal"
              onClick={() => onStarter(p)}
            >
              {p}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  let lastPrompt: string | null = null;
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      {messages.map((msg) => {
        if (msg.role === "user") {
          lastPrompt = msg.text;
          const baseUrl = msg.baseImageId ? actions.urlFor(msg.baseImageId) : null;
          const thumbs = msg.refThumbs ?? [];
          return (
            <div key={msg.id} className="flex flex-col items-end gap-1.5 pl-8 sm:pl-16">
              {(baseUrl || thumbs.length > 0) && (
                <div className="flex flex-wrap justify-end gap-1.5">
                  {baseUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- local object URL
                    <img
                      src={baseUrl}
                      alt="Continued from this image"
                      title="Continued from this image"
                      className="size-12 rounded-xl object-cover ring-1 ring-foreground/10"
                    />
                  )}
                  {thumbs.map((t, i) => (
                    // eslint-disable-next-line @next/next/no-img-element -- data URL thumbnail
                    <img
                      key={i}
                      src={t}
                      alt={`Reference image ${i + 1}`}
                      className="size-12 rounded-xl object-cover ring-1 ring-foreground/10"
                    />
                  ))}
                </div>
              )}
              <div className="max-w-full whitespace-pre-wrap break-words rounded-3xl rounded-br-lg bg-secondary px-4 py-2.5 text-sm text-secondary-foreground">
                {msg.text}
              </div>
              {msg.settings && <SettingsBadges settings={msg.settings} align="end" />}
            </div>
          );
        }

        const prompt = lastPrompt;
        const images = msg.images ?? [];
        return (
          <div key={msg.id} className="flex flex-col items-start gap-2 pr-0 sm:pr-16">
            {images.length > 0 && (
              <div className={cn("grid w-full gap-3", images.length > 1 && "sm:grid-cols-2")}>
                {images.map((image, i) => (
                  <GeneratedImage
                    key={image.id}
                    image={image}
                    index={i}
                    prompt={prompt}
                    isLatest={image.id === latestImageId}
                    missing={missing.has(image.id)}
                    actions={actions}
                  />
                ))}
              </div>
            )}
            {msg.text && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{msg.text}</p>}
            {msg.notice && (
              <div className={cn("flex items-start gap-2 rounded-2xl border px-3 py-2 text-xs", badgeTone.warning)}>
                <Info className="mt-px size-3.5 shrink-0" />
                <span>{msg.notice}</span>
              </div>
            )}
            {msg.sources && msg.sources.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Sources</span>
                {msg.sources.map((s) => (
                  <a
                    key={s.uri}
                    href={s.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(badgeVariants({ variant: "outline" }), "max-w-[16rem] font-normal")}
                  >
                    <span className="truncate">{s.title ?? hostname(s.uri)}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {pending && <PendingStatus pending={pending} active={active} />}
    </div>
  );
});
