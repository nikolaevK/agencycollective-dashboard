"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Check, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { badgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useConfirm } from "@/components/ui/use-confirm";
import { useMetaAccountOptions } from "@/hooks/useMetaAccountOptions";
import { OPTION_COLOR_TOKENS } from "@/lib/metaAccountOptionRules";
import type { MetaOptionKind, MetaAccountOption } from "@/lib/metaAccountOptions";
import { swatchClass } from "./presentation";

const KIND_COPY: Record<MetaOptionKind, { title: string; placeholder: string; blurb: string }> = {
  stage: {
    title: "Warm-up stages",
    placeholder: "Add a stage…",
    blurb: "The pipeline an account moves through. Drag order top→bottom = first→last.",
  },
  status: {
    title: "Account statuses",
    placeholder: "Add a status…",
    blurb: "Account health / standing (Active, Flagged, Banned, …).",
  },
};

/**
 * Manage a Meta Accounts chip vocabulary (Stage or Status). Everything is
 * editable — add, rename, recolor, reorder, remove. Removing an option leaves
 * any account already tagged with it untouched; it just leaves the picker.
 */
export function MetaAccountOptionsModal({
  kind,
  onClose,
}: {
  kind: MetaOptionKind;
  onClose: () => void;
}) {
  const { options, addOption, updateOption, reorderOptions, removeOption } =
    useMetaAccountOptions(kind);
  const copy = KIND_COPY[kind];
  const [draft, setDraft] = useState("");
  const [draftColor, setDraftColor] = useState<string>("slate");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(task: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await task();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd() {
    const label = draft.trim();
    if (!label) return;
    await run(async () => {
      await addOption(label, draftColor);
      setDraft("");
    });
  }

  function move(index: number, dir: -1 | 1) {
    const next = index + dir;
    if (next < 0 || next >= options.length) return;
    const order = options.map((o) => o.value);
    [order[index], order[next]] = [order[next], order[index]];
    run(() => reorderOptions(order));
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        // The old modal had no Escape handler — it closes only via the X
        // button or a backdrop click (Escape in a rename field cancels the
        // rename only).
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 pr-14">
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.blurb}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 pb-6">
          {error && (
            <div className={cn("rounded-2xl border px-4 py-3 text-sm", badgeTone.danger)}>
              {error}
            </div>
          )}

          {/* Add */}
          <div className="flex items-center gap-2">
            <ColorPicker value={draftColor} onChange={setDraftColor} disabled={busy} label="New option color" />
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              placeholder={copy.placeholder}
              aria-label={copy.placeholder}
              maxLength={40}
              disabled={busy}
              className="min-w-0 flex-1"
            />
            <Button type="button" onClick={handleAdd} disabled={busy || !draft.trim()}>
              <Plus />
              Add
            </Button>
          </div>

          {/* List */}
          <div className="space-y-1.5">
            {options.map((o, i) => (
              <OptionRow
                key={o.value}
                option={o}
                busy={busy}
                isFirst={i === 0}
                isLast={i === options.length - 1}
                onMoveUp={() => move(i, -1)}
                onMoveDown={() => move(i, 1)}
                onRename={(label) => run(() => updateOption(o.value, { label }))}
                onRecolor={(color) => run(() => updateOption(o.value, { color }))}
                onRemove={() => run(() => removeOption(o.value))}
              />
            ))}
            {options.length === 0 && (
              <p className="px-1 pt-1 text-xs text-muted-foreground">
                No options yet. Add one above.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Compact stacked reorder arrows (two fit in one row's height).
const MOVE_BTN =
  "flex h-4 w-6 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-30";

function OptionRow({
  option,
  busy,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onRename,
  onRecolor,
  onRemove,
}: {
  option: MetaAccountOption;
  busy: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRename: (label: string) => Promise<boolean>;
  onRecolor: (color: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(option.label);
  const { confirm, dialog } = useConfirm();

  async function save() {
    const next = label.trim();
    if (!next || next === option.label) {
      setEditing(false);
      setLabel(option.label);
      return;
    }
    if (await onRename(next)) setEditing(false);
  }

  return (
    <div className="flex items-center gap-2 rounded-xl px-2 py-1.5 ring-1 ring-foreground/5 dark:ring-foreground/10">
      <div className="flex flex-col">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={busy || isFirst}
          className={MOVE_BTN}
          aria-label="Move up"
          title="Move up"
        >
          <ChevronUp className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={busy || isLast}
          className={MOVE_BTN}
          aria-label="Move down"
          title="Move down"
        >
          <ChevronDown className="size-3.5" />
        </button>
      </div>

      <ColorPicker value={option.color} onChange={onRecolor} disabled={busy} label={`${option.label} color`} />

      {editing ? (
        <Input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
            if (e.key === "Escape") {
              setEditing(false);
              setLabel(option.label);
            }
          }}
          maxLength={40}
          disabled={busy}
          aria-label="Option name"
          className="h-8 min-w-0 flex-1"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{option.label}</span>
      )}

      <div className="flex shrink-0 items-center gap-1">
        {editing ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={save}
            disabled={busy}
            aria-label="Save name"
            title="Save name"
          >
            <Check />
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setEditing(true)}
            disabled={busy}
            aria-label="Rename option"
            title="Rename option"
            className="text-muted-foreground"
          >
            <Pencil />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={async () => {
            if (
              await confirm({
                title: `Remove "${option.label}"?`,
                description: "Accounts already tagged with it keep the tag.",
                confirmText: "Remove",
                destructive: true,
              })
            )
              onRemove();
          }}
          disabled={busy}
          aria-label="Remove option"
          title="Remove option"
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 />
        </Button>
      </div>
      {dialog}
    </div>
  );
}

function ColorPicker({
  value,
  onChange,
  disabled,
  label,
}: {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    // Radix Popover (portaled), so the palette isn't clipped by the dialog's
    // scrolling body.
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "size-5 shrink-0 rounded-full outline-none ring-2 ring-transparent ring-offset-2 ring-offset-popover transition-shadow hover:ring-border focus-visible:ring-ring/50 disabled:opacity-50",
            swatchClass(value)
          )}
          aria-label={`Pick color — ${label}`}
          title="Pick color"
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-auto grid-cols-6 gap-2 p-3">
        {OPTION_COLOR_TOKENS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              onChange(c);
              setOpen(false);
            }}
            className={cn(
              "size-6 rounded-full outline-none ring-offset-2 ring-offset-popover transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring/50",
              swatchClass(c),
              value === c && "ring-2 ring-foreground"
            )}
            aria-label={c}
            aria-pressed={value === c}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}
