"use client";

import { useState, useEffect } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

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

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full md:w-auto items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground",
          hasFilter
            ? "border-primary/50 bg-primary/5 text-primary"
            : "bg-background text-foreground"
        )}
      >
        <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="truncate">{display()}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform shrink-0 ml-auto",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 md:right-0 md:left-auto md:w-72 top-full z-20 mt-2 rounded-lg border bg-popover shadow-lg">
            <div className="p-2">
              <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Presets
              </p>
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    onChange({ from: preset.from, to: preset.to });
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent",
                    value.from === preset.from &&
                      value.to === preset.to &&
                      "bg-primary/10 text-primary font-medium"
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="border-t p-2">
              <button
                type="button"
                onClick={() => setShowCustom((s) => !s)}
                className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm font-medium hover:bg-accent"
              >
                Custom range
                <ChevronDown
                  className={cn("h-3 w-3 transition-transform", showCustom && "rotate-180")}
                />
              </button>

              {showCustom && (
                <div className="mt-2 space-y-2 px-2">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="mb-1 block text-xs text-muted-foreground">From</label>
                      <input
                        type="date"
                        value={customFrom}
                        onChange={(e) => setCustomFrom(e.target.value)}
                        max={customTo || undefined}
                        className="w-full rounded border bg-background px-2 py-1 text-xs"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1 block text-xs text-muted-foreground">To</label>
                      <input
                        type="date"
                        value={customTo}
                        onChange={(e) => setCustomTo(e.target.value)}
                        min={customFrom || undefined}
                        className="w-full rounded border bg-background px-2 py-1 text-xs"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onChange({ from: customFrom, to: customTo });
                      setOpen(false);
                    }}
                    className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                  >
                    Apply
                  </button>
                </div>
              )}
            </div>

            {hasFilter && (
              <div className="border-t p-2">
                <button
                  type="button"
                  onClick={() => {
                    onChange({ from: "", to: "" });
                    setCustomFrom("");
                    setCustomTo("");
                    setOpen(false);
                  }}
                  className="w-full rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
