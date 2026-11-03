"use client";

import { Loader2, Sparkles, Square } from "lucide-react";
import { CHAT_MODELS, type ChatModelId } from "@/lib/chatModels";
import {
  COUNT_LIMITS,
  CUSTOM_INDUSTRY_MAX,
  INDUSTRY_PRESETS,
  INSTRUCTIONS_MAX,
  LENGTHS,
  TONES,
} from "@/lib/adCopy/settings";
import type { GenerationSettings, LengthId, ToneId } from "@/lib/adCopy/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const COUNT_OPTIONS = Array.from({ length: COUNT_LIMITS.max - COUNT_LIMITS.min + 1 }, (_, i) => String(COUNT_LIMITS.min + i));

interface BriefCardProps {
  settings: GenerationSettings;
  onChange: (patch: Partial<GenerationSettings>) => void;
  model: ChatModelId;
  onModelChange: (m: ChatModelId) => void;
  landingUrl: string;
  onLandingUrlChange: (v: string) => void;
  canGenerate: boolean;
  disabledReason: string | null;
  running: boolean;
  hasCopy: boolean;
  pinnedCount: number;
  onGenerate: () => void;
  onStop: () => void;
}

function CountSelect({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {COUNT_OPTIONS.map((n) => (
            <SelectItem key={n} value={n}>
              {n}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function BriefCard({
  settings,
  onChange,
  model,
  onModelChange,
  landingUrl,
  onLandingUrlChange,
  canGenerate,
  disabledReason,
  running,
  hasCopy,
  pinnedCount,
  onGenerate,
  onStop,
}: BriefCardProps) {
  return (
    <Card>
      <CardHeader className="pb-4 md:pb-4">
        <CardTitle className="font-semibold tracking-tight">Brief</CardTitle>
        <CardDescription>What to write and how. Claude reads the creatives and their live copy too.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="adcopy-industry" className="text-xs text-muted-foreground">
              Industry
            </Label>
            <Select value={settings.industry} onValueChange={(v) => onChange({ industry: v })}>
              <SelectTrigger id="adcopy-industry">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRY_PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {settings.industry === "custom" && (
              <Input
                value={settings.customIndustry ?? ""}
                onChange={(e) => onChange({ customIndustry: e.target.value })}
                placeholder="e.g. Pet supplements"
                maxLength={CUSTOM_INDUSTRY_MAX}
                aria-label="Custom industry"
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adcopy-tone" className="text-xs text-muted-foreground">
              Tone
            </Label>
            <Select value={settings.tone} onValueChange={(v) => onChange({ tone: v as ToneId })}>
              <SelectTrigger id="adcopy-tone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <div className="space-y-1.5">
            <span id="adcopy-length" className="block text-xs font-medium text-muted-foreground">
              Primary text length
            </span>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={settings.length}
              onValueChange={(v) => v && onChange({ length: v as LengthId })}
              aria-labelledby="adcopy-length"
            >
              {LENGTHS.map((l) => (
                <ToggleGroupItem key={l.id} value={l.id}>
                  {l.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="flex h-8 items-center gap-2">
            <Switch id="adcopy-emojis" checked={settings.emojis} onCheckedChange={(v) => onChange({ emojis: v })} />
            <Label htmlFor="adcopy-emojis">Emojis</Label>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <CountSelect id="adcopy-n-primary" label="Primary texts" value={settings.primaryCount} onChange={(n) => onChange({ primaryCount: n })} />
          <CountSelect id="adcopy-n-headline" label="Headlines" value={settings.headlineCount} onChange={(n) => onChange({ headlineCount: n })} />
          <CountSelect
            id="adcopy-n-description"
            label="Descriptions"
            value={settings.descriptionCount}
            onChange={(n) => onChange({ descriptionCount: n })}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="adcopy-notes" className="text-xs text-muted-foreground">
              Notes for Claude <span className="font-normal">(optional)</span>
            </Label>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {settings.instructions.length}/{INSTRUCTIONS_MAX}
            </span>
          </div>
          <Textarea
            id="adcopy-notes"
            value={settings.instructions}
            onChange={(e) => onChange({ instructions: e.target.value })}
            maxLength={INSTRUCTIONS_MAX}
            rows={3}
            placeholder="Brand voice, the offer, words to avoid, claims legal approved…"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="adcopy-url" className="text-xs text-muted-foreground">
              Landing page <span className="font-normal">(preview + draft ad)</span>
            </Label>
            <Input
              id="adcopy-url"
              type="url"
              inputMode="url"
              value={landingUrl}
              onChange={(e) => onLandingUrlChange(e.target.value)}
              placeholder="https://brand.com/offer"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adcopy-model" className="text-xs text-muted-foreground">
              Model
            </Label>
            <Select value={model} onValueChange={(v) => onModelChange(v as ChatModelId)} disabled={running}>
              <SelectTrigger id="adcopy-model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHAT_MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label} <span className="text-muted-foreground">· {m.description}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {running ? (
            <>
              <Button type="button" disabled>
                <Loader2 className="animate-spin" />
                Writing…
              </Button>
              <Button type="button" variant="outline" onClick={onStop}>
                <Square className="fill-current" />
                Stop
              </Button>
            </>
          ) : (
            <Button type="button" onClick={onGenerate} disabled={!canGenerate}>
              <Sparkles />
              {hasCopy ? (pinnedCount > 0 ? `Regenerate (keep ${pinnedCount} pinned)` : "Regenerate all") : "Generate copy"}
            </Button>
          )}
          <span className="text-xs text-muted-foreground">
            {disabledReason ?? (
              <>
                <kbd className="rounded border px-1 font-sans text-[10px]">⌘</kbd>
                <kbd className="ml-0.5 rounded border px-1 font-sans text-[10px]">Enter</kbd> to generate
              </>
            )}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
