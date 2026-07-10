"use client";

import { useState } from "react";
import { X, Plus, Pencil, Trash2, Check, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMetaAccountOptions } from "@/hooks/useMetaAccountOptions";
import { OPTION_COLOR_TOKENS, type MetaOptionKind, type MetaAccountOption } from "@/lib/metaAccountOptions";
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
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative mt-16 w-full max-w-md rounded-2xl bg-card shadow-xl border border-border/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-border/50">
          <div>
            <h2 className="text-lg font-bold text-foreground">{copy.title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{copy.blurb}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Add */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <ColorPicker value={draftColor} onChange={setDraftColor} disabled={busy} />
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
                placeholder={copy.placeholder}
                maxLength={40}
                disabled={busy}
                className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
              />
              <button
                type="button"
                onClick={handleAdd}
                disabled={busy || !draft.trim()}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>
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
      </div>
    </div>
  );
}

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
    <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-background px-2.5 py-2">
      <div className="flex flex-col -my-1">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={busy || isFirst}
          className="p-0.5 rounded text-muted-foreground hover:bg-muted disabled:opacity-20"
          aria-label="Move up"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={busy || isLast}
          className="p-0.5 rounded text-muted-foreground hover:bg-muted disabled:opacity-20"
          aria-label="Move down"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      <ColorPicker value={option.color} onChange={onRecolor} disabled={busy} />

      {editing ? (
        <input
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
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus:border-primary disabled:opacity-50"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {option.label}
        </span>
      )}

      <div className="flex shrink-0 items-center gap-1">
        {editing ? (
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-40"
            aria-label="Save name"
          >
            <Check className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={busy}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted disabled:opacity-40"
            aria-label="Rename option"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (confirm(`Remove "${option.label}"? Accounts already tagged with it keep the tag.`))
              onRemove();
          }}
          disabled={busy}
          className="p-1.5 rounded-md text-destructive hover:bg-destructive/10 disabled:opacity-40"
          aria-label="Remove option"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function ColorPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn("h-5 w-5 rounded-full ring-2 ring-offset-1 ring-offset-background ring-transparent hover:ring-border disabled:opacity-50", swatchClass(value))}
        aria-label="Pick color"
      />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-7 z-20 grid grid-cols-6 gap-1.5 rounded-lg border border-border bg-popover p-2 shadow-lg">
            {OPTION_COLOR_TOKENS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                className={cn(
                  "h-5 w-5 rounded-full transition-transform hover:scale-110",
                  swatchClass(c),
                  value === c && "ring-2 ring-offset-1 ring-offset-popover ring-foreground"
                )}
                aria-label={c}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
