"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ICON_OPTIONS, resolveIcon } from "@/components/welcome-kit/icons";
import { move, removeAt, replaceAt } from "./blocks";

/* ------------------------------------------------------------------ */
/*  Basic inputs                                                       */
/* ------------------------------------------------------------------ */

export function Labeled({
  label,
  children,
  className,
}: {
  label?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      {label && (
        <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
          {label}
        </span>
      )}
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40";

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Labeled label={label}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputCls}
      />
    </Labeled>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <Labeled label={label}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={cn(inputCls, "resize-y leading-relaxed")}
      />
    </Labeled>
  );
}

export function Select<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label?: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <Labeled label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={cn(inputCls, "cursor-pointer")}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Labeled>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 py-1.5 min-h-[2.25rem] text-sm font-medium text-foreground"
    >
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted-foreground/30"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked && "translate-x-4"
          )}
        />
      </span>
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Icon picker                                                        */
/* ------------------------------------------------------------------ */

export function IconPicker({
  label,
  value,
  onChange,
}: {
  label?: string;
  value?: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const Active = resolveIcon(value);
  // Inline expanding grid (not an absolute dropdown) so it can never overflow
  // the viewport on small screens. The grid auto-fits to its container width.
  return (
    <Labeled label={label}>
      <div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={cn(inputCls, "flex items-center gap-2 text-left")}
        >
          <Active className="h-4 w-4 text-primary shrink-0" />
          <span className="text-muted-foreground">{open ? "Done" : "Choose icon"}</span>
        </button>
        {open && (
          <div className="mt-1 grid grid-cols-[repeat(auto-fill,minmax(2rem,1fr))] gap-1 p-2 rounded-lg border border-border bg-popover max-h-48 overflow-y-auto">
            {ICON_OPTIONS.map((opt) => {
              const I = resolveIcon(opt.key);
              return (
                <button
                  key={opt.key}
                  type="button"
                  title={opt.label}
                  onClick={() => {
                    onChange(opt.key);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex items-center justify-center h-8 rounded hover:bg-accent transition-colors",
                    value === opt.key && "bg-primary/15 text-primary"
                  )}
                >
                  <I className="h-4 w-4" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Labeled>
  );
}

/* ------------------------------------------------------------------ */
/*  Move / remove controls                                            */
/* ------------------------------------------------------------------ */

export function MoveControls({
  onUp,
  onDown,
  onRemove,
  canUp,
  canDown,
  removeLabel = "Remove",
}: {
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  canUp: boolean;
  canDown: boolean;
  removeLabel?: string;
}) {
  const btn =
    "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div className="flex items-center gap-0.5">
      <button type="button" onClick={onUp} disabled={!canUp} className={btn} aria-label="Move up">
        <ArrowUp className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onDown} disabled={!canDown} className={btn} aria-label="Move down">
        <ArrowDown className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-red-600 transition-colors"
        aria-label={removeLabel}
        title={removeLabel}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Collapsible card                                                  */
/* ------------------------------------------------------------------ */

export function CollapsibleCard({
  title,
  subtitle,
  icon,
  controls,
  children,
  defaultOpen = false,
  tone = "default",
}: {
  title: React.ReactNode;
  subtitle?: string;
  icon?: React.ReactNode;
  controls?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  tone?: "default" | "muted";
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className={cn(
        "rounded-xl border border-border/70",
        tone === "muted" ? "bg-muted/30" : "bg-card"
      )}
    >
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-2 min-w-0 text-left"
        >
          <span className="text-muted-foreground shrink-0">
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
          {icon && <span className="shrink-0 text-primary">{icon}</span>}
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground truncate">{title}</span>
            {subtitle && (
              <span className="block text-[11px] text-muted-foreground truncate">{subtitle}</span>
            )}
          </span>
        </button>
        {controls && <div className="shrink-0">{controls}</div>}
      </div>
      {open && <div className="border-t border-border/60 p-3 space-y-3">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  String list editor (bullets, checklist items)                     */
/* ------------------------------------------------------------------ */

export function StringListEditor({
  label,
  items,
  onChange,
  placeholder,
  addLabel = "Add item",
}: {
  label?: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  addLabel?: string;
}) {
  return (
    <Labeled label={label}>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              type="text"
              value={item}
              onChange={(e) => onChange(replaceAt(items, i, e.target.value))}
              placeholder={placeholder}
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => onChange(move(items, i, -1))}
              disabled={i === 0}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-30"
              aria-label="Move up"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onChange(move(items, i, 1))}
              disabled={i === items.length - 1}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-30"
              aria-label="Move down"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onChange(removeAt(items, i))}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
              aria-label="Remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...items, ""])}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
        >
          <Plus className="h-3.5 w-3.5" />
          {addLabel}
        </button>
      </div>
    </Labeled>
  );
}
