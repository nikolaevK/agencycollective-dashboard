"use client";

import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { type CrossReferenceEvent } from "@/hooks/useGhlContacts";
import type { GhlContactRef } from "@/types/ghl";

export interface GhlCrossReferenceData {
  byGoogleEventId: Record<string, GhlContactRef | null>;
}

/**
 * Decorates a calendar event card with the matching GHL contact. Strict
 * composite-key match (title + startTime + endTime) under the hood — no
 * email fallback, no false positives.
 *
 * Always batched: the parent calls `useGhlCrossReference({ events })` once
 * with the full visible set and passes `data` down. The chip renders
 * nothing until `data` arrives. This used to ALSO support a standalone
 * mode where the chip fired its own one-event query when `data` was
 * undefined, but that fired 50+ per-event queries on every calendar /
 * dashboard render before the parent's batched fetch resolved — every
 * chip raced its own request, then went idle once the parent caught up.
 *
 *     const { data } = useGhlCrossReference({ events });
 *     <GhlEventChip event={e} data={data} />
 */
export function GhlEventChip({
  event,
  data,
  className,
}: {
  event?: CrossReferenceEvent | null;
  data?: GhlCrossReferenceData;
  className?: string;
}) {
  if (!data || !event) return null;

  const ref = data.byGoogleEventId[event.id] ?? null;
  if (!ref) return null;

  return (
    <a
      href={`/closer/ghl-contacts?selected=${encodeURIComponent(ref.id)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-700 dark:text-blue-400 hover:bg-blue-500/20 transition-colors",
        className
      )}
      title="GHL contact"
    >
      <span className="font-semibold">GHL</span>
      <span className="truncate max-w-[10rem]">{ref.name ?? ref.email ?? "(unnamed)"}</span>
      {ref.tags[0] && (
        <Badge variant="secondary" className="px-1 py-0 text-[9px]">
          {ref.tags[0]}
        </Badge>
      )}
      <ExternalLink className="h-2.5 w-2.5 opacity-60" />
    </a>
  );
}

/**
 * Collect the cross-reference inputs for a calendar's worth of events.
 * Pass the result straight to `useGhlCrossReference`.
 */
export function buildGhlCrossReferenceInputs<
  T extends { id: string; title: string; start: string; end: string }
>(events: T[]): { events: CrossReferenceEvent[] } {
  const seen = new Set<string>();
  const out: CrossReferenceEvent[] = [];
  for (const e of events) {
    if (!e.id || seen.has(e.id)) continue;
    if (!e.start) continue; // composite key requires a start time
    seen.add(e.id);
    out.push({
      id: e.id,
      title: e.title ?? "",
      startTime: e.start,
      endTime: e.end ?? "",
    });
  }
  return { events: out };
}
