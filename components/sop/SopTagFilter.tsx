"use client";

import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Radix SelectItem can't hold "" — "All tags" maps to this sentinel.
const ALL_TAGS = "__all_tags__";

/** Tag filter for the SOP library (own module so the Radix Select loads lazily). */
export function SopTagFilter({ tags, value, onChange }: {
  tags: string[];
  value: string;
  onChange: (tag: string) => void;
}) {
  // A tag chip sets the filter from a SOP's own tag text — match the list's
  // casing (the filter itself is case-insensitive) so the trigger shows it.
  const listed = value ? tags.find((t) => t.toLowerCase() === value.toLowerCase()) : undefined;
  const items = value && !listed ? [...tags, value] : tags;
  return (
    <Select value={value ? listed ?? value : ALL_TAGS} onValueChange={(v) => onChange(v === ALL_TAGS ? "" : v)}>
      <SelectTrigger
        aria-label="Filter by tag"
        title="Filter by tag"
        className={cn("h-8 w-auto min-w-[8.5rem] max-w-[12rem]", value && "ring-1 ring-foreground/25")}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_TAGS}>All tags</SelectItem>
        {items.map((t) => (
          <SelectItem key={t} value={t}>#{t}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
