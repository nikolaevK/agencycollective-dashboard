"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TIME_FRAME_OPTIONS,
  buildTimeFrame,
  customTimeFrame,
  type TimeFrame,
  type TimeFrameKey,
} from "@/lib/timeFrame";

interface Props {
  value: TimeFrame;
  onChange: (next: TimeFrame) => void;
  /** Hide the custom-range option (e.g. on dense mobile surfaces). */
  hideCustom?: boolean;
}

/**
 * Pill row + custom-range expander. Reusable across admin queue, closer
 * dashboard, and setter dashboard so all three surfaces label and resolve
 * time frames identically.
 */
export function TimeFrameSelector({ value, onChange, hideCustom }: Props) {
  const [showCustom, setShowCustom] = useState(value.key === "custom");
  const [customSince, setCustomSince] = useState(value.since ?? "");
  const [customUntil, setCustomUntil] = useState(value.until ?? "");

  // Sync local input state when the parent pushes a new custom range
  // (e.g. URL state restore) — without this, the inputs stayed stale and
  // the displayed dates wouldn't match the actual active window.
  useEffect(() => {
    if (value.key === "custom") {
      setCustomSince(value.since ?? "");
      setCustomUntil(value.until ?? "");
    }
  }, [value.key, value.since, value.until]);

  // Re-derive the active key for active-pill styling. "custom" is its own
  // pill so the user can tell at a glance that the date inputs apply.
  const activeKey: TimeFrameKey = value.key;

  function pickPreset(key: Exclude<TimeFrameKey, "custom">) {
    setShowCustom(false);
    onChange(buildTimeFrame(key));
  }

  function applyCustom() {
    if (!customSince || !customUntil) return;
    if (customSince > customUntil) return;
    onChange(customTimeFrame(customSince, customUntil));
  }

  const customPillLabel = useMemo(() => {
    if (value.key !== "custom") return "Custom";
    if (value.since && value.until) return `${value.since} → ${value.until}`;
    return "Custom";
  }, [value]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Time frame">
        {TIME_FRAME_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => pickPreset(opt.value)}
            aria-pressed={activeKey === opt.value}
            className={cn(
              "inline-flex items-center h-8 px-3 rounded-md text-xs font-medium transition-colors",
              activeKey === opt.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            {opt.label}
          </button>
        ))}
        {!hideCustom && (
          <button
            type="button"
            onClick={() => setShowCustom((v) => !v)}
            aria-pressed={activeKey === "custom"}
            aria-expanded={showCustom}
            className={cn(
              "inline-flex items-center gap-1 h-8 px-3 rounded-md text-xs font-medium transition-colors",
              activeKey === "custom"
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Calendar className="h-3 w-3" />
            {customPillLabel}
          </button>
        )}
      </div>

      {showCustom && !hideCustom && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input
            type="date"
            value={customSince}
            onChange={(e) => setCustomSince(e.target.value)}
            aria-label="From date"
            className="h-8 rounded-md border border-border bg-background px-2 focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
          <span className="text-muted-foreground">to</span>
          <input
            type="date"
            value={customUntil}
            onChange={(e) => setCustomUntil(e.target.value)}
            aria-label="To date"
            className="h-8 rounded-md border border-border bg-background px-2 focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
          <button
            type="button"
            onClick={applyCustom}
            disabled={!customSince || !customUntil || customSince > customUntil}
            className="inline-flex items-center h-8 px-3 rounded-md text-xs font-medium bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
