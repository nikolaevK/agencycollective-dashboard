"use client";

import { useQuery } from "@tanstack/react-query";
import { Gem } from "lucide-react";
import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import {
  OFFER_REQUEST_STATUS_LABELS,
  OPEN_REQUEST_STATUSES,
  type OfferRequestStatus,
} from "@/lib/portalOfferRules";
import type { ClientOfferActivity } from "@/lib/portalOffers";

/**
 * Client overview: which of our other services this client opened in the
 * portal (More from Agency Collective) and what they asked for — so the team
 * walks into a call knowing what they've been looking at. Renders nothing
 * until there's something to show.
 */
export function ClientOfferActivityCard({ userId }: { userId: string }) {
  const { data } = useQuery({
    queryKey: ["admin-client-offer-activity", userId],
    queryFn: async (): Promise<ClientOfferActivity> => {
      const res = await fetch(`/api/admin/clients/${encodeURIComponent(userId)}/offer-activity`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()).data as ClientOfferActivity;
    },
    staleTime: 60_000,
  });

  if (!data || (data.views.length === 0 && data.requests.length === 0)) return null;
  // Per service: its open request, else its newest (the list is newest first).
  const requestsByOffer = new Map<string, (typeof data.requests)[number]>();
  for (const r of data.requests) {
    const seen = requestsByOffer.get(r.offerId);
    if (!seen || (isOpen(r.status) && !isOpen(seen.status))) requestsByOffer.set(r.offerId, r);
  }
  // Requests for services this client never opened (e.g. since deleted) still show — one per service too.
  const requestOnly = Array.from(requestsByOffer.values()).filter(
    (r) => !data.views.some((v) => v.offerId === r.offerId)
  );

  return (
    <Card>
      <CardHeader className="pb-3 md:pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Gem className="size-4 text-muted-foreground" />
          <CardTitle>Interested in</CardTitle>
          <span className="text-xs text-muted-foreground">· More from Agency Collective, in their portal</span>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {data.views.map((v) => {
            const req = requestsByOffer.get(v.offerId);
            return (
              <li key={v.offerId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="font-medium text-foreground">{v.title}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  Viewed {v.viewCount}×{v.linkClicks > 0 && ` · ${v.linkClicks} link click${v.linkClicks === 1 ? "" : "s"}`} · last{" "}
                  {formatDate(v.lastViewedAt)}
                  {req && <RequestChip status={req.status} kind={req.kind} />}
                </span>
              </li>
            );
          })}
          {requestOnly.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="font-medium text-foreground">{r.offerTitle}</span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                Requested {formatDate(r.createdAt)}
                <RequestChip status={r.status} kind={r.kind} />
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

const isOpen = (s: OfferRequestStatus) => OPEN_REQUEST_STATUSES.includes(s);

/** Lead status → chip tone (same map as the Requests inbox). */
const REQUEST_TONE: Record<OfferRequestStatus, BadgeTone> = {
  new: "info",
  contacted: "warning",
  won: "success",
  lost: "neutral",
};

function RequestChip({ status, kind }: { status: OfferRequestStatus; kind: string }) {
  return (
    <StatusBadge tone={REQUEST_TONE[status]}>
      {kind === "book_call" ? "Call" : "Request"}: {OFFER_REQUEST_STATUS_LABELS[status]}
    </StatusBadge>
  );
}
