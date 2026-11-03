"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ADMIN_ROLE_OPTIONS } from "./types";

// Radix Select can't hold "" as an item value — a blank legacy role maps to
// this sentinel and back.
const BLANK_ROLE = "__blank__";

/** Role picker for the Add/Edit Admin forms. Legacy free-text roles stay
 *  selectable so editing other fields doesn't silently clobber them. */
export function AdminRoleSelect({
  id,
  value,
  onChange,
  className,
}: {
  id?: string;
  value: string;
  onChange: (role: string) => void;
  className?: string;
}) {
  const isPreset = ADMIN_ROLE_OPTIONS.some((o) => o.value === value);
  return (
    <Select
      value={value === "" ? BLANK_ROLE : value}
      onValueChange={(v) => onChange(v === BLANK_ROLE ? "" : v)}
    >
      <SelectTrigger id={id} className={className}>
        <SelectValue />
      </SelectTrigger>
      {/* Above the hand-built z-[60] admin forms */}
      <SelectContent className="z-[70]">
        {ADMIN_ROLE_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
        {!isPreset && (
          <SelectItem value={value === "" ? BLANK_ROLE : value}>{value || "(none)"}</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
