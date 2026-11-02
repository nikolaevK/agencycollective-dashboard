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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select as KitSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { move, removeAt, replaceAt } from "./blocks";

// Radix SelectItem can't hold "" — an empty option value maps to this.
const NONE = "__none__";

/** Ghost icon button tinted red on hover — the remove control. */
const removeBtnCls = "text-muted-foreground hover:bg-destructive/10 hover:text-destructive";

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
        <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
          {label}
        </span>
      )}
      {children}
    </label>
  );
}

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
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
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
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="min-h-0 resize-y leading-relaxed"
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
      <KitSelect
        value={value === "" ? NONE : value}
        onValueChange={(v) => onChange((v === NONE ? "" : v) as T)}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value === "" ? NONE : o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </KitSelect>
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
    <label className="flex min-h-9 w-fit cursor-pointer items-center gap-2 py-1.5 text-sm font-medium text-foreground">
      <Switch checked={checked} onCheckedChange={(v) => onChange(v)} />
      {label}
    </label>
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
          className="flex h-9 w-full min-w-0 items-center gap-2 rounded-3xl border border-transparent bg-input/50 px-3 text-left text-sm outline-none transition-[color,box-shadow,background-color] hover:bg-input/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
        >
          <Active className="size-4 shrink-0 text-foreground" />
          <span className="truncate text-muted-foreground">{open ? "Done" : "Choose icon"}</span>
        </button>
        {open && (
          <div className="mt-1.5 grid max-h-48 grid-cols-[repeat(auto-fill,minmax(2rem,1fr))] gap-1 overflow-y-auto rounded-2xl bg-popover p-2 shadow-sm ring-1 ring-foreground/5 dark:ring-foreground/10">
            {ICON_OPTIONS.map((opt) => {
              const I = resolveIcon(opt.key);
              const selected = value === opt.key;
              return (
                <Button
                  key={opt.key}
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title={opt.label}
                  aria-label={opt.label}
                  aria-pressed={selected}
                  onClick={() => {
                    onChange(opt.key);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full rounded-xl",
                    selected &&
                      "bg-primary text-primary-foreground hover:bg-primary/80 hover:text-primary-foreground dark:hover:bg-primary/80"
                  )}
                >
                  <I />
                </Button>
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
  return (
    <div className="flex items-center gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onUp}
        disabled={!canUp}
        className="text-muted-foreground"
        aria-label="Move up"
      >
        <ArrowUp />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onDown}
        disabled={!canDown}
        className="text-muted-foreground"
        aria-label="Move down"
      >
        <ArrowDown />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
        className={removeBtnCls}
        aria-label={removeLabel}
        title={removeLabel}
      >
        <Trash2 />
      </Button>
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
  const muted = tone === "muted";
  const inner = (
    <>
      <div className={cn("flex items-center gap-2", muted ? "p-2 pl-3" : "p-3 pl-4")}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
        >
          <span className="shrink-0 text-muted-foreground">
            {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </span>
          {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-foreground">{title}</span>
            {subtitle && (
              <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
            )}
          </span>
        </button>
        {controls && <div className="shrink-0">{controls}</div>}
      </div>
      {open && (
        <div className={cn("space-y-3 border-t", muted ? "p-3" : "p-4")}>{children}</div>
      )}
    </>
  );
  return muted ? <div className="rounded-2xl bg-muted/50">{inner}</div> : <Card>{inner}</Card>;
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
          <div key={i} className="flex items-center gap-0.5">
            <Input
              type="text"
              value={item}
              onChange={(e) => onChange(replaceAt(items, i, e.target.value))}
              placeholder={placeholder}
              className="mr-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onChange(move(items, i, -1))}
              disabled={i === 0}
              className="text-muted-foreground"
              aria-label="Move up"
            >
              <ArrowUp />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onChange(move(items, i, 1))}
              disabled={i === items.length - 1}
              className="text-muted-foreground"
              aria-label="Move down"
            >
              <ArrowDown />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onChange(removeAt(items, i))}
              className={removeBtnCls}
              aria-label="Remove"
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => onChange([...items, ""])}
          className="text-muted-foreground"
        >
          <Plus />
          {addLabel}
        </Button>
      </div>
    </Labeled>
  );
}
