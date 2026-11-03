"use client";

import { useState } from "react";
import { ArrowRight, ChevronRight, Loader2, Wand2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, badgeToneHover, badgeVariants, type BadgeTone } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  GEMINI_IMAGE_MODELS,
  geminiImageModelInfo,
  imageSizeLabel,
  type GeminiImageModelId,
  type GeminiImageSize,
} from "@/lib/geminiModels";
import { MAX_DIFF_ENTRIES, previewValue, type JsonChange } from "@/lib/jsonEditor/diff";
import type { FieldGuideEntry } from "@/lib/jsonEditor/schemas";
import type { JsonPreset } from "@/lib/jsonEditor/presets";

const SHOWN_CHANGES = 40;

const CHANGE_LABEL: Record<JsonChange["kind"], { label: string; tone: BadgeTone }> = {
  added: { label: "Added", tone: "success" },
  removed: { label: "Removed", tone: "danger" },
  changed: { label: "Changed", tone: "info" },
};

function ChangeRow({ change }: { change: JsonChange }) {
  const meta = CHANGE_LABEL[change.kind];
  return (
    <li className="flex min-w-0 items-start gap-2 py-1.5">
      <StatusBadge tone={meta.tone} className="mt-px">
        {meta.label}
      </StatusBadge>
      <div className="min-w-0 flex-1 text-xs">
        <p className="truncate font-mono text-foreground" title={change.path}>
          {change.path}
        </p>
        <p className="flex min-w-0 items-center gap-1 text-muted-foreground">
          {change.kind !== "added" && (
            <span className="truncate line-through decoration-muted-foreground/50">
              {previewValue(change.before, 80)}
            </span>
          )}
          {change.kind === "changed" && <ArrowRight aria-label="to" className="size-3 shrink-0" />}
          {change.kind !== "removed" && <span className="truncate text-foreground">{previewValue(change.after, 80)}</span>}
        </p>
      </div>
    </li>
  );
}

export interface ReferenceAction {
  /** Button text, e.g. "Copy camera from reference". */
  label: string;
  /** Object-swap: the scene objects the reference can replace. */
  targets?: { index: number; name: string }[];
  onApply: (targetIndex?: number) => void;
}

interface GeneratePanelProps {
  changes: JsonChange[];
  /** The edited JSON parses — quick edits can run. */
  editable: boolean;
  presets: readonly JsonPreset[];
  onPreset: (preset: JsonPreset) => void;
  referenceAction: ReferenceAction | null;
  fieldGuide: FieldGuideEntry[];
  model: GeminiImageModelId;
  onModelChange: (model: GeminiImageModelId) => void;
  /** The size that will be requested (already clamped to the model). */
  resolution: GeminiImageSize;
  onResolutionChange: (resolution: GeminiImageSize) => void;
  canGenerate: boolean;
  /** Why Generate is disabled (shown under the button). */
  blockedReason: string | null;
  generating: boolean;
  busy: boolean;
  onGenerate: () => void;
  onCancel: () => void;
  /** The last generation failure, shown above the button. */
  error?: React.ReactNode;
  className?: string;
}

/** Quick edits, the change list, model settings and the Generate button. */
export function GeneratePanel({
  changes,
  editable,
  presets,
  onPreset,
  referenceAction,
  fieldGuide,
  model,
  onModelChange,
  resolution,
  onResolutionChange,
  canGenerate,
  blockedReason,
  generating,
  busy,
  onGenerate,
  onCancel,
  error,
  className,
}: GeneratePanelProps) {
  const [swapTarget, setSwapTarget] = useState<string>("");
  const info = geminiImageModelInfo(model);
  const resolutions = info.sizes;
  const shown = changes.slice(0, SHOWN_CHANGES);
  const hasQuickEdits = presets.length > 0 || referenceAction !== null;

  return (
    <Card className={cn("flex min-h-0 flex-col", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="font-semibold tracking-tight">Changes</CardTitle>
        <CardDescription className="text-xs">
          {changes.length === 0
            ? "Edit values in the JSON — every change is listed here and sent to the image model."
            : `${changes.length}${changes.length >= MAX_DIFF_ENTRIES ? "+" : ""} change${changes.length === 1 ? "" : "s"} will be applied to the image.`}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-col gap-4">
        {hasQuickEdits && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Quick edits</p>
            {presets.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {presets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={!editable || busy}
                    onClick={() => onPreset(p)}
                    className={cn(
                      badgeVariants({ variant: "outline" }),
                      badgeToneHover.neutral,
                      "h-7 cursor-pointer px-3 disabled:pointer-events-none disabled:opacity-50"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
            {referenceAction && (
              <div className="flex flex-wrap items-center gap-2">
                {referenceAction.targets && (
                  <Select value={swapTarget} onValueChange={setSwapTarget} disabled={!editable || busy}>
                    <SelectTrigger className="h-8 w-auto min-w-0 max-w-[14rem]" aria-label="Object to replace">
                      <SelectValue placeholder="Object to replace" />
                    </SelectTrigger>
                    <SelectContent>
                      {referenceAction.targets.map((t) => (
                        <SelectItem key={t.index} value={String(t.index)}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!editable || busy || (!!referenceAction.targets && swapTarget === "")}
                  onClick={() => referenceAction.onApply(swapTarget === "" ? undefined : Number(swapTarget))}
                >
                  {referenceAction.label}
                </Button>
              </div>
            )}
          </div>
        )}

        {changes.length > 0 && (
          <ul aria-label="Changes" className="max-h-48 divide-y divide-border/60 overflow-y-auto pr-1">
            {shown.map((c) => (
              <ChangeRow key={`${c.kind}:${c.path}`} change={c} />
            ))}
            {changes.length > shown.length && (
              <li className="py-1.5 text-xs text-muted-foreground">+{changes.length - shown.length} more</li>
            )}
          </ul>
        )}

        {fieldGuide.length > 0 && (
          <details className="group rounded-2xl bg-muted/40 px-3 py-2 text-xs">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground [&::-webkit-details-marker]:hidden">
              <ChevronRight aria-hidden className="size-3.5 transition-transform group-open:rotate-90" />
              Field guide
            </summary>
            <dl className="mt-2 max-h-56 space-y-1.5 overflow-y-auto pr-1">
              {fieldGuide.map((f) => (
                <div key={f.path}>
                  <dt className="font-mono text-foreground">{f.path}</dt>
                  <dd className="text-muted-foreground">{f.description}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}

        <div className="flex flex-wrap items-end gap-3 border-t border-border/60 pt-4">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="json-editor-model" className="text-xs text-muted-foreground">
              Image model
            </Label>
            <Select value={model} onValueChange={(v) => onModelChange(v as GeminiImageModelId)} disabled={busy}>
              <SelectTrigger id="json-editor-model" className="h-8 min-w-[10rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GEMINI_IMAGE_MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {resolutions.length > 1 && (
            <div className="space-y-1.5">
              <p id="json-editor-resolution" className="text-xs font-medium text-muted-foreground">
                Resolution
              </p>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={resolution}
                onValueChange={(v) => v && onResolutionChange(v as GeminiImageSize)}
                aria-labelledby="json-editor-resolution"
                disabled={busy}
              >
                {resolutions.map((r) => (
                  <ToggleGroupItem key={r} value={r} className="px-2.5 text-xs">
                    {imageSizeLabel(r)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          )}
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">
          {info.description}
          {resolutions.length === 1 && ` · ${imageSizeLabel(resolutions[0])} output`}
        </p>

        <div className="space-y-2">
          {error}
          <div className="flex gap-2">
            <Button type="button" className="flex-1" onClick={onGenerate} disabled={!canGenerate}>
              {generating ? <Loader2 className="animate-spin" /> : <Wand2 />}
              {generating ? "Generating…" : "Generate image"}
            </Button>
            {generating && (
              <Button type="button" variant="outline" onClick={onCancel}>
                <X />
                Cancel
              </Button>
            )}
          </div>
          <p className="text-center text-xs text-muted-foreground">
            {blockedReason ?? (
              <>
                <kbd className="font-sans">⌘/Ctrl + Enter</kbd> in the editor also generates
              </>
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
