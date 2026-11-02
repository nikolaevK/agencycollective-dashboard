import type { DateRangeInput, DatePreset } from "@/types/api";

// The date-range vocabulary, kept apart from DateRangePicker so pages that only
// need a label (rangeLabel) don't pull the picker's popover into their bundle.

export const DATE_RANGE_PRESETS: Array<{ label: string; value: DatePreset }> = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 days", value: "last_7d" },
  { label: "Last 14 days", value: "last_14d" },
  { label: "Last 30 days", value: "last_30d" },
  { label: "Last 90 days", value: "last_90d" },
  { label: "This month", value: "this_month" },
  { label: "Last month", value: "last_month" },
];

function presetLabel(preset: DatePreset): string {
  return DATE_RANGE_PRESETS.find((p) => p.value === preset)?.label ?? preset;
}

export function rangeLabel(range: DateRangeInput): string {
  if (range.preset) return presetLabel(range.preset);
  if (range.since && range.until) {
    return `${range.since} – ${range.until}`;
  }
  return "Select range";
}
