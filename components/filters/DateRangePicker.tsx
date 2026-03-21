"use client";

import { useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DateRangeInput, DatePreset } from "@/types/api";

const PRESETS: Array<{ label: string; value: DatePreset }> = [
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
  return PRESETS.find((p) => p.value === preset)?.label ?? preset;
}

function rangeLabel(range: DateRangeInput): string {
  if (range.preset) return presetLabel(range.preset);
  if (range.since && range.until) {
    return `${range.since} – ${range.until}`;
  }
  return "Select range";
}

interface DateRangePickerProps {
  value: DateRangeInput;
  onChange: (range: DateRangeInput) => void;
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [customSince, setCustomSince] = useState(value.since ?? "");
  const [customUntil, setCustomUntil] = useState(value.until ?? "");
  const [showCustom, setShowCustom] = useState(!value.preset);

  function selectPreset(preset: DatePreset) {
    onChange({ preset });
    setShowCustom(false);
    setOpen(false);
  }

  function applyCustom() {
    if (customSince && customUntil && customSince <= customUntil) {
      onChange({ since: customSince, until: customUntil });
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full md:w-auto items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="truncate">{rangeLabel(value)}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform shrink-0 ml-auto",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute left-0 right-0 md:left-auto md:right-0 md:w-72 top-full z-20 mt-2 rounded-lg border bg-popover shadow-lg">
            <div className="p-2">
              <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Presets
              </p>
              {PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => selectPreset(preset.value)}
                  className={cn(
                    "flex w-full items-center rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent",
                    value.preset === preset.value && "bg-primary/10 text-primary font-medium"
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="border-t p-2">
              <button
                onClick={() => setShowCustom(!showCustom)}
                className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm font-medium hover:bg-accent"
              >
                Custom range
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform",
                    showCustom && "rotate-180"
                  )}
                />
              </button>

              {showCustom && (
                <div className="mt-2 space-y-2 px-2">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="mb-1 block text-xs text-muted-foreground">
                        From
                      </label>
                      <input
                        type="date"
                        value={customSince}
                        onChange={(e) => setCustomSince(e.target.value)}
                        max={customUntil || undefined}
                        className="w-full rounded border bg-background px-2 py-1 text-xs"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1 block text-xs text-muted-foreground">
                        To
                      </label>
                      <input
                        type="date"
                        value={customUntil}
                        onChange={(e) => setCustomUntil(e.target.value)}
                        min={customSince || undefined}
                        className="w-full rounded border bg-background px-2 py-1 text-xs"
                      />
                    </div>
                  </div>
                  <button
                    onClick={applyCustom}
                    disabled={!customSince || !customUntil || customSince > customUntil}
                    className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90"
                  >
                    Apply
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
