"use client";

import { memo } from "react";
import { Check, Copy, Eye, Loader2, Pin, PinOff, Plus, RefreshCw, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { charCount, fitsByPlacement } from "@/lib/adCopy/limits";
import type { CopyField, CopyVariant } from "@/lib/adCopy/types";
import { MAX_VARIANTS_PER_FIELD, type CopyLists } from "@/lib/adCopy/variants";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const FIELD_META: Record<CopyField, { title: string; noun: string; hint: string }> = {
  primaryText: { title: "Primary text", noun: "primary text", hint: "Feeds show ~125 characters before “See more”." },
  headline: { title: "Headlines", noun: "headline", hint: "27 characters fit the Facebook feed; 40 elsewhere." },
  description: { title: "Descriptions", noun: "description", hint: "Shown under the headline on Facebook (≈27 characters)." },
};

export interface CopyEditorProps {
  lists: CopyLists;
  offers: string[];
  selected: Record<CopyField, string | null>;
  busy: boolean;
  /** The variant currently being regenerated (spinner), if any. */
  regeneratingId: string | null;
  copiedKey: string | null;
  onEdit: (field: CopyField, id: string, patch: Partial<CopyVariant>) => void;
  onRemove: (field: CopyField, id: string) => void;
  onAdd: (field: CopyField) => void;
  onSelect: (field: CopyField, id: string) => void;
  onRegenerate: (field: CopyField, id: string) => void;
  onUndo: (field: CopyField, id: string) => void;
  onCopy: (key: string, text: string) => void;
}

function IconAction({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          aria-pressed={pressed}
          className={cn(pressed && "bg-muted text-foreground")}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function LengthBadges({ field, text }: { field: CopyField; text: string }) {
  const count = charCount(text.trim());
  if (!count) return null;
  const fits = fitsByPlacement(field, text);
  const over = fits.filter((f) => f.over);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] tabular-nums text-muted-foreground">{count} chars</span>
      {field === "primaryText"
        ? over.length > 0 && (
            <Badge variant="outline" tone="info" className="font-normal">
              “See more” after {Math.min(...over.map((f) => f.limit))}
            </Badge>
          )
        : over.map((f) => (
            <StatusBadge key={f.placement.id} tone="warning" className="font-normal">
              Cut off in {f.placement.label} ({f.limit})
            </StatusBadge>
          ))}
    </div>
  );
}

function VariantRow({
  field,
  variant,
  index,
  isSelected,
  props,
}: {
  field: CopyField;
  variant: CopyVariant;
  index: number;
  isSelected: boolean;
  props: CopyEditorProps;
}) {
  const meta = FIELD_META[field];
  const copyKey = `${field}:${variant.id}`;
  const regenerating = props.regeneratingId === variant.id;
  const label = `${meta.title.replace(/s$/, "")} ${index + 1}`;

  return (
    <li
      className={cn(
        "space-y-2 rounded-2xl p-3 ring-1 transition-colors",
        isSelected ? "bg-muted/50 ring-foreground/20" : "ring-foreground/10"
      )}
    >
      <div className="flex items-center gap-1">
        <span className="mr-1 text-xs font-medium tabular-nums text-muted-foreground">{index + 1}</span>
        {field === "primaryText" ? (
          <Input
            value={variant.angle ?? ""}
            onChange={(e) => props.onEdit(field, variant.id, { angle: e.target.value })}
            placeholder="Angle"
            aria-label={`${label} angle`}
            maxLength={60}
            className="h-7 min-w-0 max-w-[16rem] flex-1 bg-transparent px-2 text-xs font-medium focus-visible:bg-input/50"
          />
        ) : (
          <span className="flex-1" />
        )}
        <div className="ml-auto flex items-center">
          <IconAction label={isSelected ? "In preview" : "Show in preview"} onClick={() => props.onSelect(field, variant.id)} pressed={isSelected}>
            <Eye />
          </IconAction>
          <IconAction
            label={variant.pinned ? "Unpin (regenerate all replaces it)" : "Pin (kept when you regenerate all)"}
            onClick={() => props.onEdit(field, variant.id, { pinned: !variant.pinned })}
            pressed={variant.pinned}
          >
            {variant.pinned ? <Pin /> : <PinOff />}
          </IconAction>
          <IconAction label={`Rewrite this ${meta.noun}`} onClick={() => props.onRegenerate(field, variant.id)} disabled={props.busy || !variant.text.trim()}>
            {regenerating ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          </IconAction>
          {variant.previous !== undefined && (
            <IconAction label="Undo rewrite" onClick={() => props.onUndo(field, variant.id)} disabled={props.busy}>
              <Undo2 />
            </IconAction>
          )}
          <IconAction label={props.copiedKey === copyKey ? "Copied" : "Copy"} onClick={() => props.onCopy(copyKey, variant.text)} disabled={!variant.text.trim()}>
            {props.copiedKey === copyKey ? <Check /> : <Copy />}
          </IconAction>
          <IconAction label="Remove" onClick={() => props.onRemove(field, variant.id)} disabled={regenerating}>
            <X />
          </IconAction>
        </div>
      </div>
      {field === "primaryText" ? (
        <Textarea
          value={variant.text}
          onChange={(e) => props.onEdit(field, variant.id, { text: e.target.value })}
          rows={Math.min(10, Math.max(3, variant.text.split("\n").length + 1))}
          aria-label={label}
          disabled={regenerating}
          className="resize-y leading-relaxed"
        />
      ) : (
        <Input
          value={variant.text}
          onChange={(e) => props.onEdit(field, variant.id, { text: e.target.value })}
          aria-label={label}
          disabled={regenerating}
          className={cn(field === "headline" && "font-medium")}
        />
      )}
      <LengthBadges field={field} text={variant.text} />
    </li>
  );
}

function FieldSection({ field, props }: { field: CopyField; props: CopyEditorProps }) {
  const meta = FIELD_META[field];
  const list = props.lists[field];
  const selectedId = props.selected[field] ?? list.find((v) => v.text.trim())?.id ?? null;
  return (
    <section className="space-y-3" aria-labelledby={`adcopy-${field}`}>
      <div className="flex items-end justify-between gap-2">
        <div>
          <h4 id={`adcopy-${field}`} className="text-sm font-semibold tracking-tight">
            {meta.title} <span className="font-normal tabular-nums text-muted-foreground">{list.length}</span>
          </h4>
          <p className="text-xs text-muted-foreground">{meta.hint}</p>
        </div>
        <Button type="button" variant="outline" size="xs" onClick={() => props.onAdd(field)} disabled={list.length >= MAX_VARIANTS_PER_FIELD}>
          <Plus />
          Add
        </Button>
      </div>
      {list.length === 0 ? (
        <p className="rounded-2xl px-3 py-4 text-center text-xs text-muted-foreground ring-1 ring-foreground/10">
          No {meta.noun}s yet — add one or regenerate.
        </p>
      ) : (
        <ul className="space-y-2" role="list">
          {list.map((v, i) => (
            <VariantRow key={v.id} field={field} variant={v} index={i} isSelected={v.id === selectedId} props={props} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** The generated copy: detected offers + editable variant lists. Memoized — the generator re-renders while a rewrite streams. */
export const CopyEditor = memo(function CopyEditor(props: CopyEditorProps) {
  return (
    <Card>
      <CardHeader className="pb-4 md:pb-4">
        <CardTitle className="font-semibold tracking-tight">Ad copy</CardTitle>
        <CardDescription>Edit freely. Pin the keepers, rewrite single items, and pick what the preview shows.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {props.offers.length > 0 && (
          <div className="space-y-2 rounded-2xl bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">
              Read from the creatives — check codes and numbers before publishing. Click to copy.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {props.offers.map((o) => {
                const key = `offer:${o}`;
                return (
                  <Button key={o} type="button" variant="outline" size="xs" onClick={() => props.onCopy(key, o)} className="font-mono">
                    {props.copiedKey === key && <Check />}
                    {o}
                  </Button>
                );
              })}
            </div>
          </div>
        )}
        <FieldSection field="primaryText" props={props} />
        <FieldSection field="headline" props={props} />
        <FieldSection field="description" props={props} />
      </CardContent>
    </Card>
  );
});
