"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
      <div className="flex flex-wrap items-center gap-1">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          // Empty while a custom range is active — no preset is selected then.
          value={activeKey === "custom" ? "" : activeKey}
          // Radix reports "" when the active item is clicked again; a time
          // frame can't be deselected, so ignore that.
          onValueChange={(v) => {
            if (v) pickPreset(v as Exclude<TimeFrameKey, "custom">);
          }}
          aria-label="Time frame"
          className="flex-wrap justify-start"
        >
          {TIME_FRAME_OPTIONS.map((opt) => (
            <ToggleGroupItem key={opt.value} value={opt.value} className="px-3">
              {opt.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {!hideCustom && (
          <Toggle
            variant="outline"
            size="sm"
            pressed={activeKey === "custom"}
            onPressedChange={() => setShowCustom((v) => !v)}
            aria-expanded={showCustom}
            className="px-3"
          >
            <Calendar />
            {customPillLabel}
          </Toggle>
        )}
      </div>

      {showCustom && !hideCustom && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Input
            type="date"
            value={customSince}
            onChange={(e) => setCustomSince(e.target.value)}
            aria-label="From date"
            className="h-8 w-auto"
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="date"
            value={customUntil}
            onChange={(e) => setCustomUntil(e.target.value)}
            aria-label="To date"
            className="h-8 w-auto"
          />
          <Button
            type="button"
            size="sm"
            onClick={applyCustom}
            disabled={!customSince || !customUntil || customSince > customUntil}
          >
            Apply
          </Button>
        </div>
      )}
    </div>
  );
}
