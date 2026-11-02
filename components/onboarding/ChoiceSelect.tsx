"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Option } from "@/lib/onboardingForm";

/** Radix Select can't hold "" — this item stands for the old empty option. */
const NO_CHOICE = "__none__";

/** One-of-many answer as a kit Select (loaded lazily by the questionnaire). */
export function ChoiceSelect({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: string | null;
  options: Option[];
  onChange: (v: string | null) => void;
}) {
  return (
    <Select value={value ?? ""} onValueChange={(v) => onChange(v === NO_CHOICE ? null : v || null)}>
      <SelectTrigger id={id}>
        <SelectValue placeholder="Select…" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_CHOICE} className="text-muted-foreground">
          Select…
        </SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
