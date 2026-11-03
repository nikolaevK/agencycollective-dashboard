"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, BadgeDot, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TOUCH_TARGET } from "@/components/ui/touch";
import { Input } from "@/components/ui/input";
import { ChipPopover } from "./ChipPopover";

export interface ChipOption {
  value: string;
  label: string;
}

/**
 * Local mirror of a selection prop. Rapid toggles must compute the next array
 * from the FRESHEST selection — the prop alone lags one render behind in a
 * heavy table, so two quick clicks would both derive from the same stale
 * array and silently drop the first one. The mirror updates synchronously on
 * toggle and re-syncs whenever the prop's CONTENT changes (refetch/rollback);
 * `key` must encode that content.
 */
export function useMirroredSelection<T>(
  value: T,
  key: string
): [T, (next: T) => void] {
  const [local, setLocal] = useState<T>(value);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setLocal(value), [key]);
  return [local, setLocal];
}

/**
 * Roster chip editor: selected values render as outline badges with an ×, a
 * `+` button opens a popover of all options to toggle. Stored values missing
 * from `options` (e.g. a legacy value) still render as neutral chips so
 * nothing silently disappears.
 */
export function ChipMultiSelect({
  value,
  options,
  onChange,
  colorOf,
  toneOf,
  disabled,
  addLabel = "Add",
  compact,
  onCreateOption,
}: {
  value: string[];
  options: ReadonlyArray<ChipOption>;
  onChange: (next: string[]) => void;
  /**
   * Legacy: extra chip color classes per value (the old *_CHIP_CLS maps).
   * Ignored when `toneOf` is given; prefer `toneOf`.
   */
  colorOf?: (value: string) => string;
  /**
   * Status tone per value (stage / health / billing vocab) — renders a
   * StatusBadge-style chip with a dot. Omit for neutral category chips.
   */
  toneOf?: (value: string) => BadgeTone;
  disabled?: boolean;
  addLabel?: string;
  /** Tighter spacing for mobile cards. */
  compact?: boolean;
  /**
   * When provided, the popover shows an inline "create new option" field.
   * Returns the new option's stable value (auto-selected for this row) or null
   * on failure. The option is persisted globally, so it appears for every row.
   */
  onCreateOption?: (label: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);
  const [selected, setSelected] = useMirroredSelection(value, JSON.stringify(value));
  const [draft, setDraft] = useState("");
  const [creating, setCreating] = useState(false);

  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;

  function emit(next: string[]) {
    setSelected(next);
    onChange(next);
  }

  function toggle(v: string) {
    emit(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  }

  async function createOption() {
    const label = draft.trim();
    if (!label || !onCreateOption || creating) return;
    setCreating(true);
    try {
      const newValue = await onCreateOption(label);
      if (newValue) {
        setDraft("");
        if (!selected.includes(newValue)) emit([...selected, newValue]);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not add option");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      className={cn("flex flex-wrap items-center", compact ? "gap-1" : "gap-1.5")}
      onClick={(e) => e.stopPropagation()}
    >
      {selected.map((v) => {
        const tone = toneOf?.(v);
        return (
          <Badge
            key={v}
            variant="outline"
            tone={tone}
            // Touch: the ×'s grown hit area may spill past the chip. Phones:
            // a long label truncates instead of pushing the × off the card.
            className={cn(
              tone ? "gap-1.5" : "gap-1",
              !toneOf && colorOf?.(v),
              "max-md:max-w-full [@media(pointer:coarse)]:overflow-visible"
            )}
          >
            {tone && <BadgeDot tone={tone} />}
            <span className="max-md:min-w-0 max-md:truncate">{labelOf(v)}</span>
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  emit(selected.filter((x) => x !== v));
                }}
                // Touch: a 32px hit area and a × that doesn't need hover.
                className={cn(
                  TOUCH_TARGET,
                  "-mr-0.5 rounded-full opacity-50 outline-none transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 [@media(pointer:coarse)]:opacity-80 [@media(pointer:coarse)]:after:-inset-2.5"
                )}
                aria-label={`Remove ${labelOf(v)}`}
              >
                <X className="size-3" />
              </button>
            )}
          </Badge>
        );
      })}
      {!disabled && (
        <Button
          ref={addRef}
          type="button"
          variant="outline"
          size="icon-xs"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          aria-expanded={open}
          className="size-5 rounded-full border-dashed text-muted-foreground"
          aria-label={addLabel}
        >
          <Plus />
        </Button>
      )}
      {open && addRef.current && (
        <ChipPopover anchor={addRef.current} onClose={() => setOpen(false)}>
          {options.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No options available</p>
          )}
          {options.map((o) => {
            const checked = selected.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                aria-pressed={checked}
                className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-left text-sm font-medium outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-[5px] transition-colors",
                    checked ? "bg-primary text-primary-foreground" : "bg-input/90"
                  )}
                >
                  {checked && <Check className="size-3.5" />}
                </span>
                <span className="flex-1 truncate">{o.label}</span>
              </button>
            );
          })}
          {onCreateOption && (
            <div className="mt-1.5 border-t px-1 pb-0.5 pt-2">
              <div className="flex items-center gap-1.5">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      createOption();
                    }
                  }}
                  placeholder="New option…"
                  maxLength={40}
                  disabled={creating}
                  className="h-8 min-w-0 flex-1 px-2.5"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={createOption}
                  disabled={creating || !draft.trim()}
                  className="shrink-0"
                >
                  Add
                </Button>
              </div>
            </div>
          )}
        </ChipPopover>
      )}
    </div>
  );
}
