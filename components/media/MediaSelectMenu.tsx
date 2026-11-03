"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { EMPTY_OPTION, type MediaSelectProps } from "./MediaSelect";

/**
 * Kit Select over a flat option list — the real control behind MediaSelect.
 * Loaded and mounted only once someone opens that select, so Radix Select
 * (+ popper) isn't part of an ordinary visit to the directory.
 */
export function MediaSelectMenu({
  value,
  onValueChange,
  options,
  "aria-label": ariaLabel,
  title,
  className,
  defaultOpen,
}: MediaSelectProps & { defaultOpen?: boolean }) {
  return (
    <Select
      defaultOpen={defaultOpen}
      value={value === "" ? EMPTY_OPTION : value}
      onValueChange={(v) => onValueChange(v === EMPTY_OPTION ? "" : v)}
    >
      <SelectTrigger aria-label={ariaLabel} title={title} className={cn("h-8 w-auto min-w-0", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value || EMPTY_OPTION} value={o.value === "" ? EMPTY_OPTION : o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
