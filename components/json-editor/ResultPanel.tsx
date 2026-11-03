"use client";

import { useId, useState } from "react";
import { Braces, Download, ImageIcon, Loader2, Repeat2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { metaForUseCase, type UseCase } from "@/lib/jsonEditor/useCases";

export interface GeneratedResult {
  id: string;
  /** Object URL of `blob` (revoked by the owner when the result is dropped). */
  url: string;
  /** Object URL of the source image this version was generated from. */
  sourceUrl: string;
  blob: Blob;
  mimeType: string;
  /** Text the image model sent along, if any. */
  text: string | null;
  /** Re-encoded server-side to fit the response size cap. */
  compressed: boolean;
  modelLabel: string;
  resolution: string | null;
  /** The JSON that produced this image (describes it). */
  editedJson: string;
  changeCount: number;
  /** Use case it was made in — its JSON has that use case's shape. */
  useCase: UseCase;
  /** The analysis its JSON was edited from (the editor's analysisId at the time). */
  baselineId: number;
  /** Version number: counts up per generation, never reused when old versions are dropped. */
  seq: number;
  createdAt: number;
}

type CompareMode = "result" | "split" | "source";

interface ResultPanelProps {
  results: GeneratedResult[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  generating: boolean;
  elapsedSeconds: number;
  /** The editor's current use case and analysis — a version's JSON only fits these. */
  useCase: UseCase | null;
  baselineId: number;
  onUseAsSource: (result: GeneratedResult) => void;
  onLoadJson: (result: GeneratedResult) => void;
  className?: string;
}

function extensionOf(mimeType: string): string {
  return mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1] || "png";
}

function Picture({ url, alt, label }: { url: string; alt: string; label?: string }) {
  return (
    <figure className="relative min-w-0 flex-1 overflow-hidden rounded-2xl bg-muted/50 ring-1 ring-foreground/5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} className="mx-auto max-h-[60vh] w-full object-contain xl:max-h-[calc(100vh-26rem)]" />
      {label && (
        <figcaption className="absolute left-2 top-2 rounded-full bg-background/80 px-2 py-0.5 text-[11px] font-medium backdrop-blur-sm">
          {label}
        </figcaption>
      )}
    </figure>
  );
}

/** The generated images: compare against the source, download, iterate. */
export function ResultPanel({
  results,
  selectedId,
  onSelect,
  generating,
  elapsedSeconds,
  useCase,
  baselineId,
  onUseAsSource,
  onLoadJson,
  className,
}: ResultPanelProps) {
  const [mode, setMode] = useState<CompareMode>("result");
  const hintId = useId();
  const selected = results.find((r) => r.id === selectedId) ?? results[0] ?? null;
  const index = selected?.seq ?? 0;
  const sourceUrl = selected?.sourceUrl ?? null;
  // Its JSON only means something in its own use case, and only diffs
  // correctly against the analysis it was edited from.
  const otherUseCase = !!selected && selected.useCase !== useCase;
  const otherBaseline = !!selected && !otherUseCase && selected.baselineId !== baselineId;
  const actionHint = otherUseCase
    ? `Made in ${metaForUseCase(selected.useCase).label} — switch back to that use case to edit it or load its JSON.`
    : otherBaseline
      ? "Made from an earlier image or analysis — its JSON doesn't match the current one. Use Edit this version instead."
      : null;

  return (
    <Card className={cn("flex min-h-0 flex-col", className)}>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-4">
        <div className="min-w-0">
          <CardTitle className="font-semibold tracking-tight">Result</CardTitle>
          <CardDescription className="mt-0.5 text-xs">
            {results.length > 0
              ? `${results.length} version${results.length === 1 ? "" : "s"} this session`
              : "Generated images appear here"}
          </CardDescription>
        </div>
        {selected && sourceUrl && (
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={mode}
            // Radix reports "" when the pressed item is clicked again — keep the mode.
            onValueChange={(v) => v && setMode(v as CompareMode)}
            aria-label="Compare view"
          >
            <ToggleGroupItem value="result" className="px-2.5 text-xs">
              Result
            </ToggleGroupItem>
            <ToggleGroupItem value="split" className="px-2.5 text-xs">
              Compare
            </ToggleGroupItem>
            <ToggleGroupItem value="source" className="px-2.5 text-xs">
              Original
            </ToggleGroupItem>
          </ToggleGroup>
        )}
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        {generating && (
          <div className="space-y-2">
            <Skeleton className="h-48 w-full rounded-2xl" />
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 aria-hidden className="size-3.5 animate-spin" />
              {/* Only the phase is announced — not the per-second timer. */}
              <span>
                <span role="status">Generating…</span> <span aria-hidden>{elapsedSeconds}s</span>
                {" — usually 15–60 seconds"}
              </span>
            </p>
          </div>
        )}

        {selected ? (
          <>
            <div className={cn("flex gap-3", mode === "split" && "flex-col sm:flex-row xl:flex-col 2xl:flex-row")}>
              {(mode === "source" || mode === "split") && sourceUrl && (
                <Picture url={sourceUrl} alt="Original image" label={mode === "split" ? "Original" : undefined} />
              )}
              {(mode === "result" || mode === "split" || !sourceUrl) && (
                <Picture
                  url={selected.url}
                  alt={`Generated version ${index}`}
                  label={mode === "split" ? `Version ${index}` : undefined}
                />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <StatusBadge tone="neutral">Version {index}</StatusBadge>
              <span>{selected.modelLabel}</span>
              {selected.resolution && <span>· {selected.resolution}</span>}
              <span>
                · {selected.changeCount} change{selected.changeCount === 1 ? "" : "s"}
              </span>
              {selected.compressed && <span>· compressed to fit the download limit</span>}
            </div>

            {selected.text && (
              <p className="rounded-2xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{selected.text}</p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <a href={selected.url} download={`json-editor-v${index}.${extensionOf(selected.mimeType)}`}>
                  <Download />
                  Download
                </a>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onUseAsSource(selected)}
                disabled={generating || otherUseCase}
                aria-describedby={otherUseCase ? hintId : undefined}
                title="Make this image the new source and keep editing from its JSON"
              >
                <Repeat2 />
                Edit this version
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onLoadJson(selected)}
                disabled={otherUseCase || otherBaseline}
                aria-describedby={actionHint ? hintId : undefined}
                title="Put the JSON that produced this version back in the editor"
              >
                <Braces />
                Load its JSON
              </Button>
            </div>
            {actionHint && (
              <p id={hintId} className="-mt-2 text-xs text-muted-foreground">
                {actionHint}
              </p>
            )}

            {results.length > 1 && (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Versions</p>
                <div className="flex flex-wrap gap-2">
                  {results.map((r) => {
                    const n = r.seq;
                    const isSelected = r.id === selected.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => onSelect(r.id)}
                        aria-pressed={isSelected}
                        aria-label={`Version ${n}`}
                        className={cn(
                          "relative size-16 overflow-hidden rounded-xl bg-muted outline-none ring-offset-2 ring-offset-background transition focus-visible:ring-[3px] focus-visible:ring-ring/30",
                          isSelected ? "ring-2 ring-foreground" : "opacity-80 hover:opacity-100"
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={r.url} alt="" className="size-full object-cover" />
                        <span className="absolute bottom-0.5 right-1 rounded-full bg-background/80 px-1 text-[10px] font-medium tabular-nums">
                          {n}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          !generating && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
              <ImageIcon aria-hidden className="size-6 text-muted-foreground/60" />
              <p className="text-sm font-medium">No image yet</p>
              <p className="max-w-60 text-xs text-muted-foreground">
                Analyze an image, change values in its JSON, then generate.
              </p>
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}
