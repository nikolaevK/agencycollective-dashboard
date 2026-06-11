"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChipPopover } from "./ChipPopover";
import { CHIP_BASE, FALLBACK_CHIP_CLS } from "./rosterPresentation";

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
 * Roster chip editor: selected values render as colored chips with an ×, a
 * `+` button opens a popover of all options to toggle. Stored values missing
 * from `options` (e.g. a legacy value) still render as gray chips so nothing
 * silently disappears.
 */
export function ChipMultiSelect({
  value,
  options,
  onChange,
  colorOf,
  disabled,
  addLabel = "Add",
  compact,
}: {
  value: string[];
  options: ReadonlyArray<ChipOption>;
  onChange: (next: string[]) => void;
  /** Chip color class per value; defaults to gray. */
  colorOf?: (value: string) => string;
  disabled?: boolean;
  addLabel?: string;
  /** Tighter spacing for mobile cards. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);
  const [selected, setSelected] = useMirroredSelection(value, JSON.stringify(value));

  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  const clsOf = (v: string) => colorOf?.(v) ?? FALLBACK_CHIP_CLS;

  function emit(next: string[]) {
    setSelected(next);
    onChange(next);
  }

  function toggle(v: string) {
    emit(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  }

  return (
    <div
      className={cn("flex flex-wrap items-center", compact ? "gap-1" : "gap-1.5")}
      onClick={(e) => e.stopPropagation()}
    >
      {selected.map((v) => (
        <span key={v} className={cn(CHIP_BASE, clsOf(v))}>
          {labelOf(v)}
          {!disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                emit(selected.filter((x) => x !== v));
              }}
              className="opacity-50 hover:opacity-100 transition-opacity"
              aria-label={`Remove ${labelOf(v)}`}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <button
          ref={addRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          className="inline-flex items-center justify-center h-5 w-5 rounded-full border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          aria-label={addLabel}
        >
          <Plus className="h-3 w-3" />
        </button>
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
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-accent transition-colors"
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                    checked ? "bg-primary border-primary" : "border-input bg-background"
                  )}
                >
                  {checked && <Check className="h-3 w-3 text-primary-foreground" />}
                </span>
                <span className={cn("text-left flex-1", checked && "font-semibold")}>
                  {o.label}
                </span>
              </button>
            );
          })}
        </ChipPopover>
      )}
    </div>
  );
}
