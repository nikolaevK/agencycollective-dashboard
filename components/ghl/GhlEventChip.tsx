"use client";

import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { type CrossReferenceEvent } from "@/hooks/useGhlContacts";
import {
  DEFAULT_SUB_ACCOUNT_ID,
  getSubAccount,
  isValidSubAccountId,
} from "@/lib/ghl/subAccounts";
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
 * nothing until `data` arrives.
 *
 *     const { data } = useGhlCrossReference({ events });
 *     <GhlEventChip event={e} data={data} isAdmin={isAdmin} />
 *
 * Routing: the chip is a deep-link to the GHL contacts page in whichever
 * portal the caller is rendering. Admins land in
 * `/dashboard/closers/ghl-contacts`; closers/setters land in
 * `/closer/ghl-contacts`. Both URLs carry `subAccount=...` so the right
 * tab opens to the contact's owning sub-account.
 */
export function GhlEventChip({
  event,
  data,
  isAdmin,
  className,
}: {
  event?: CrossReferenceEvent | null;
  data?: GhlCrossReferenceData;
  /** True when the chip is rendered inside the admin dashboard. Drives the
   *  base path of the deep-link so admins stay in /dashboard/* instead of
   *  bouncing to the closer portal. */
  isAdmin?: boolean;
  className?: string;
}) {
  if (!data || !event) return null;

  const ref = data.byGoogleEventId[event.id] ?? null;
  if (!ref) return null;

  // Fall back to the historical-data default (peptide) when the API didn't
  // surface a sub-account on the ref. That should never happen with the
  // updated server, but if it does (stale cache, mid-deploy), the contact is
  // almost certainly from the original pre-multi-account install.
  const subId = isValidSubAccountId(ref.subAccountId)
    ? ref.subAccountId
    : DEFAULT_SUB_ACCOUNT_ID;
  const sub = getSubAccount(subId);

  const basePath = isAdmin ? "/dashboard/closers/ghl-contacts" : "/closer/ghl-contacts";
  const href = `${basePath}?selected=${encodeURIComponent(ref.id)}&subAccount=${encodeURIComponent(subId)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-700 dark:text-blue-400 hover:bg-blue-500/20 transition-colors",
        className
      )}
      title={`GHL contact (${sub.label})`}
    >
      <span className="font-semibold">GHL</span>
      <span
        className={cn(
          "inline-flex items-center justify-center rounded px-1 py-0 text-[9px] font-bold border",
          sub.badgeClass
        )}
        title={sub.label}
      >
        {sub.shortLabel}
      </span>
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
