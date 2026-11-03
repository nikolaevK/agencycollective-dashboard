"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ASPECT_RATIO_HINTS,
  GEMINI_IMAGE_MODELS,
  clampImageSize,
  geminiImageModelInfo,
  imageSizeLabel,
  isAspectRatioFor,
  type GenerateMode,
} from "@/lib/geminiModels";
import type { GenerateSettings } from "@/hooks/useImageGeneratorSession";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** Select can't hold "" — the model-decides ratio. */
const AUTO_RATIO = "__auto";

export function GenerateSettingsCard({
  settings,
  onChange,
  onModeChange,
  pending,
}: {
  settings: GenerateSettings;
  onChange: (patch: Partial<GenerateSettings>) => void;
  /** Mode changes go through the parent (it confirms clearing the thread). */
  onModeChange: (mode: GenerateMode) => void;
  /** A generation is running — the mode (which resets the thread) is locked. */
  pending?: boolean;
}) {
  const [open, setOpen] = useState(false); // mobile only
  const ids = {
    body: useId(),
    mode: useId(),
    model: useId(),
    size: useId(),
    ratio: useId(),
    search: useId(),
  };

  const info = geminiImageModelInfo(settings.model);
  // The stored preference survives a model that can't honour it; show what will be sent.
  const size = clampImageSize(settings.model, settings.resolution);
  const ratio = isAspectRatioFor(settings.model, settings.aspectRatio) ? settings.aspectRatio : null;
  const summary = [
    info.label,
    imageSizeLabel(size),
    ratio ?? "Auto ratio",
    settings.mode === "multi-turn" ? "Multi-turn" : "Single-turn",
  ].join(" · ");

  return (
    <Card className="flex shrink-0 flex-col lg:w-80 lg:overflow-y-auto">
      {/* Mobile: a summary row that expands the settings in place. */}
      <button
        type="button"
        className="flex items-center justify-between gap-3 rounded-[inherit] p-4 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 lg:hidden"
        aria-expanded={open}
        aria-controls={ids.body}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium">Settings</span>
          <span className="block truncate text-xs text-muted-foreground">{summary}</span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      <div
        id={ids.body}
        className={cn(
          "space-y-6 px-4 pb-4 lg:block lg:p-6",
          open ? "block" : "hidden"
        )}
      >
        <div className="hidden space-y-1.5 lg:block">
          <CardTitle className="font-semibold tracking-tight">Settings</CardTitle>
          <CardDescription>Used for your next message.</CardDescription>
        </div>

        {/* Mode */}
        <div className="space-y-2">
          <p id={ids.mode} className="text-sm font-medium">
            Mode
          </p>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            className="grid w-full grid-cols-2"
            value={settings.mode}
            // Radix reports "" when the active item is clicked again — ignore.
            onValueChange={(v) => v && onModeChange(v as GenerateMode)}
            aria-labelledby={ids.mode}
            disabled={pending}
          >
            <ToggleGroupItem value="multi-turn">Multi-turn</ToggleGroupItem>
            <ToggleGroupItem value="single-turn">Single-turn</ToggleGroupItem>
          </ToggleGroup>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {settings.mode === "multi-turn"
              ? "Refine through conversation — each message edits the latest image."
              : "Every prompt stands alone — attach images to edit them in one shot."}
          </p>
        </div>

        {/* Model */}
        <div className="space-y-2">
          <Label htmlFor={ids.model}>Model</Label>
          <Select value={settings.model} onValueChange={(v) => onChange({ model: v as GenerateSettings["model"] })}>
            <SelectTrigger id={ids.model}>
              <SelectValue>{info.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {GEMINI_IMAGE_MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id} className="items-start">
                  <span className="flex flex-col gap-0.5">
                    <span>{m.label}</span>
                    <span className="text-xs font-normal text-muted-foreground">{m.description}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Resolution */}
        <div className="space-y-2">
          <p id={ids.size} className="text-sm font-medium">
            Resolution
          </p>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            className="flex w-full flex-wrap"
            value={size}
            onValueChange={(v) => v && onChange({ resolution: v as GenerateSettings["resolution"] })}
            aria-labelledby={ids.size}
          >
            {info.sizes.map((s) => (
              <ToggleGroupItem key={s} value={s} className="flex-1">
                {imageSizeLabel(s)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {info.sizes.length === 1
              ? `${info.label} renders at ${imageSizeLabel(info.sizes[0])} only.`
              : "Higher resolutions take longer and cost more."}
          </p>
          {settings.mode === "multi-turn" && info.sizes.includes("4K") && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              4K images are too large to keep in the conversation — each 4K turn restarts from the latest image.
            </p>
          )}
        </div>

        {/* Aspect ratio */}
        <div className="space-y-2">
          <Label htmlFor={ids.ratio}>Aspect ratio</Label>
          <Select
            value={ratio ?? AUTO_RATIO}
            onValueChange={(v) => onChange({ aspectRatio: v === AUTO_RATIO ? null : v })}
          >
            <SelectTrigger id={ids.ratio}>
              <SelectValue>{ratio ? `${ratio} · ${ASPECT_RATIO_HINTS[ratio] ?? ""}` : "Auto"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUTO_RATIO}>
                Auto <span className="font-normal text-muted-foreground">· match the input, else square</span>
              </SelectItem>
              {info.aspectRatios.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                  {ASPECT_RATIO_HINTS[r] && (
                    <span className="font-normal text-muted-foreground"> · {ASPECT_RATIO_HINTS[r]}</span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Google Search grounding */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <Label htmlFor={ids.search}>Google Search</Label>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {info.search
                ? "Lets the model look up real-world facts (products, places, events)."
                : `Not available with ${info.label}.`}
            </p>
          </div>
          <Switch
            id={ids.search}
            checked={info.search && settings.search}
            onCheckedChange={(checked) => onChange({ search: checked })}
            disabled={!info.search}
          />
        </div>
      </div>
    </Card>
  );
}
