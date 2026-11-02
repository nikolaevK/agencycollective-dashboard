"use client";

import { useId, useState } from "react";
import dynamic from "next/dynamic";
import { Calendar, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DateRangeInput, DatePreset } from "@/types/api";
import { DATE_RANGE_PRESETS, rangeLabel } from "./dateRangeLabel";

// Lazy: this picker sits in every page's top bar, and the date fields (with
// date-fns) are only needed once "Custom range" is opened.
const DatePicker = dynamic(() => import("@/components/ui/date-picker").then((m) => m.DatePicker), {
  ssr: false,
  loading: () => <div aria-hidden className="h-9 w-full rounded-3xl bg-input/50" />,
});

const PRESETS = DATE_RANGE_PRESETS;

// Re-exported for existing importers; label-only callers should import from
// ./dateRangeLabel (no popover in their bundle).
export { rangeLabel };

interface DateRangePickerProps {
  value: DateRangeInput;
  onChange: (range: DateRangeInput) => void;
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [customSince, setCustomSince] = useState(value.since ?? "");
  const [customUntil, setCustomUntil] = useState(value.until ?? "");
  const [showCustom, setShowCustom] = useState(!value.preset);
  const fieldId = useId();

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
    <div>
      {/* Modal: an outside click only closes the menu (like the old backdrop),
          it never lands on the page underneath. */}
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-start gap-2 md:w-auto">
            <Calendar className="text-muted-foreground" />
            <span className="min-w-0 truncate">{rangeLabel(value)}</span>
            <ChevronDown
              className={cn("ml-auto text-muted-foreground transition-transform", open && "rotate-180")}
            />
          </Button>
        </PopoverTrigger>

        {/* Right-anchored at a real width on all screens (a full-width mobile
            trigger must not stretch or shrink it). */}
        <PopoverContent
          align="end"
          sideOffset={8}
          collisionPadding={16}
          className="max-h-[var(--radix-popover-content-available-height)] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain p-1.5"
        >
          <p className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">Presets</p>
          {PRESETS.map((preset) => {
            const active = value.preset === preset.value;
            return (
              <button
                key={preset.value}
                type="button"
                onClick={() => selectPreset(preset.value)}
                aria-pressed={active}
                className={cn(
                  "flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:bg-accent",
                  active && "font-medium"
                )}
              >
                {preset.label}
                {active && <Check className="size-4" />}
              </button>
            );
          })}

          <div className="-mx-1.5 my-1.5 h-px bg-border/50" />

          <button
            type="button"
            onClick={() => setShowCustom(!showCustom)}
            aria-expanded={showCustom}
            className="flex w-full items-center justify-between rounded-2xl px-3 py-2 text-sm font-medium outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
          >
            Custom range
            <ChevronDown className={cn("size-4 transition-transform", showCustom && "rotate-180")} />
          </button>

          {showCustom && (
            <div className="space-y-3 px-3 pb-2 pt-1">
              <div className="space-y-1.5">
                <Label htmlFor={`${fieldId}-from`} className="text-xs font-normal text-muted-foreground">
                  From
                </Label>
                <DatePicker
                  id={`${fieldId}-from`}
                  value={customSince}
                  onValueChange={setCustomSince}
                  max={customUntil || undefined}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${fieldId}-to`} className="text-xs font-normal text-muted-foreground">
                  To
                </Label>
                <DatePicker
                  id={`${fieldId}-to`}
                  value={customUntil}
                  onValueChange={setCustomUntil}
                  min={customSince || undefined}
                />
              </div>
              <Button
                size="sm"
                className="w-full"
                onClick={applyCustom}
                disabled={!customSince || !customUntil || customSince > customUntil}
              >
                Apply
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
