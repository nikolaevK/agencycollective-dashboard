"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Radix Select can't hold "" as an item value — "" options ride on this
// sentinel and are mapped back before the caller sees them.
const EMPTY = "__none__";

/**
 * Kit Select over a flat option list, for the directory's toolbar + upload
 * bar. Its own module so the directory can load it with next/dynamic and keep
 * Radix Select (+ popper) out of the page's first-load chunk.
 */
export function MediaSelect({
  value,
  onValueChange,
  options,
  "aria-label": ariaLabel,
  title,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  "aria-label": string;
  title?: string;
  className?: string;
}) {
  return (
    <Select
      value={value === "" ? EMPTY : value}
      onValueChange={(v) => onValueChange(v === EMPTY ? "" : v)}
    >
      <SelectTrigger aria-label={ariaLabel} title={title} className={cn("h-8 w-auto min-w-0", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value || EMPTY} value={o.value === "" ? EMPTY : o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
