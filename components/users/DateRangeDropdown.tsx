"use client";

import { useState, useEffect } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface DateRangeValue {
  from: string;
  to: string;
}

/** Presets relative to today (yyyy-mm-dd). */
function getDatePresets() {
  const today = new Date();
  // Local calendar date (NOT toISOString, which would shift a day for evening
  // local times in UTC-negative zones). Stored dates are calendar dates.
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  const sub = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    return fmt(d);
  };
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
  return [
    { label: "Last 7 days", from: sub(6), to: fmt(today) },
    { label: "Last 14 days", from: sub(13), to: fmt(today) },
    { label: "Last 30 days", from: sub(29), to: fmt(today) },
    { label: "Last 90 days", from: sub(89), to: fmt(today) },
    { label: "This month", from: fmt(startOfMonth), to: fmt(today) },
    { label: "Last month", from: fmt(startOfLastMonth), to: fmt(endOfLastMonth) },
  ];
}

/**
 * Self-contained date-range dropdown (presets + custom range), mirroring the
 * Payout page's DateJoinedPicker. Controlled via `value`/`onChange`.
 */
export function DateRangeDropdown({
  label,
  value,
  onChange,
}: {
  label: string;
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState(value.from);
  const [customTo, setCustomTo] = useState(value.to);

  // Re-sync custom inputs when the controlled value changes externally
  // (e.g. "Clear filters" or a preset selected elsewhere).
  useEffect(() => {
    setCustomFrom(value.from);
    setCustomTo(value.to);
  }, [value.from, value.to]);

  const presets = getDatePresets();
  const hasFilter = Boolean(value.from || value.to);

  function display(): string {
    if (!value.from && !value.to) return label;
    const match = presets.find((p) => p.from === value.from && p.to === value.to);
    if (match) return match.label;
    if (value.from && value.to) return `${value.from} – ${value.to}`;
    if (value.from) return `From ${value.from}`;
    return `To ${value.to}`;
  }

  // Modal: an outside click only closes the dropdown (the old click-catcher
  // swallowed it) — inside Add Client it must not also hit the backdrop and
  // close the whole modal.
  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start md:w-auto",
            hasFilter && "border-foreground/20 bg-muted dark:bg-muted"
          )}
        >
          <Calendar className="text-muted-foreground" />
          <span className="truncate">{display()}</span>
          <ChevronDown
            className={cn(
              "ml-auto text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 max-w-[calc(100vw-2rem)] p-0">
        <div className="p-1.5">
          <p className="px-3 py-1.5 text-xs text-muted-foreground">Presets</p>
          {presets.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange({ from: preset.from, to: preset.to });
                setOpen(false);
              }}
              className={cn(
                "w-full justify-start rounded-2xl px-3 font-normal",
                value.from === preset.from &&
                  value.to === preset.to &&
                  "bg-accent font-medium text-accent-foreground"
              )}
            >
              {preset.label}
            </Button>
          ))}
        </div>

        <div className="border-t p-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowCustom((s) => !s)}
            aria-expanded={showCustom}
            className="w-full justify-between rounded-2xl px-3"
          >
            Custom range
            <ChevronDown
              className={cn("size-3 transition-transform", showCustom && "rotate-180")}
            />
          </Button>

          {showCustom && (
            <div className="mt-2 space-y-2 px-1.5 pb-1.5">
              <div className="flex gap-2">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label className="text-xs font-normal text-muted-foreground">From</Label>
                  <DatePicker
                    value={customFrom}
                    onValueChange={setCustomFrom}
                    max={customTo || undefined}
                    placeholder="Start"
                    aria-label="From"
                    className="h-8 px-2.5 text-xs"
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label className="text-xs font-normal text-muted-foreground">To</Label>
                  <DatePicker
                    value={customTo}
                    onValueChange={setCustomTo}
                    min={customFrom || undefined}
                    placeholder="End"
                    aria-label="To"
                    className="h-8 px-2.5 text-xs"
                  />
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onChange({ from: customFrom, to: customTo });
                  setOpen(false);
                }}
                className="w-full"
              >
                Apply
              </Button>
            </div>
          )}
        </div>

        {hasFilter && (
          <div className="border-t p-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange({ from: "", to: "" });
                setCustomFrom("");
                setCustomTo("");
                setOpen(false);
              }}
              className="w-full rounded-2xl text-muted-foreground"
            >
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
