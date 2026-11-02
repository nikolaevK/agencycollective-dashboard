"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Eye, Inbox, Mail, Phone, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import {
  OFFER_REQUEST_STATUSES,
  OFFER_REQUEST_STATUS_LABELS,
  OPEN_REQUEST_STATUSES,
  isPlainEmail,
  type OfferRequestStatus,
} from "@/lib/portalOfferRules";
import { QueryErrorState } from "@/components/shared/QueryErrorState";
import { Badge, BadgeDot, badgeTone, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { OfferRequestListItem } from "@/lib/portalOffers";

/** Prefix of every request query — invalidating it refreshes the list AND the badge count. */
export const OFFER_REQUESTS_KEY = ["admin-offer-requests"];
const LIST_KEY = [...OFFER_REQUESTS_KEY, "list"];

async function fetchOfferRequests(): Promise<OfferRequestListItem[]> {
  const res = await fetch("/api/admin/clients/offer-requests");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).data as OfferRequestListItem[];
}

/** "New" requests the admin can see — the Cross-sell tab badge (a count, not the list). */
export function useNewOfferRequestCount(enabled: boolean): number {
  const { data = 0 } = useQuery({
    queryKey: [...OFFER_REQUESTS_KEY, "count"],
    queryFn: async () => {
      const res = await fetch("/api/admin/clients/offer-requests/count");
      if (!res.ok) return 0;
      return Number((await res.json()).data?.count ?? 0);
    },
    staleTime: 60_000,
    enabled,
  });
  return data;
}

type Filter = "open" | "won" | "lost" | "all";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
  { id: "all", label: "All" },
];

function matches(f: Filter, status: OfferRequestStatus): boolean {
  if (f === "all") return true;
  if (f === "open") return OPEN_REQUEST_STATUSES.includes(status);
  return status === f;
}

const STATUS_TONE: Record<OfferRequestStatus, BadgeTone> = {
  new: "info",
  contacted: "warning",
  won: "success",
  lost: "neutral",
};

/** Leads clients filed from the portal's More from Agency Collective tab. */
export function OfferRequestsInbox() {
  const [filter, setFilter] = useState<Filter>("open");
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: LIST_KEY,
    queryFn: fetchOfferRequests,
    staleTime: 60_000,
  });
  const rows = data ?? [];
  const shown = rows.filter((r) => matches(filter, r.status));

  if (isError) return <QueryErrorState title="Couldn't load requests" onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={filter}
        onValueChange={(v) => {
          if (v) setFilter(v as Filter);
        }}
        aria-label="Filter requests"
        className="flex-wrap justify-start"
      >
        {FILTERS.map((f) => {
          const count = rows.filter((r) => matches(f.id, r.status)).length;
          return (
            <ToggleGroupItem key={f.id} value={f.id} className="px-3">
              {f.label} <span className="tabular-nums text-muted-foreground">{count}</span>
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <Card className="px-6 py-10 text-center">
          <Inbox className="mx-auto mb-2 size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {rows.length === 0
              ? "No requests yet. They appear here when a client hits Request info or Book a call."
              : "Nothing in this view."}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {shown.map((r) => (
            <RequestRow key={r.id} request={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestRow({ request: r }: { request: OfferRequestListItem }) {
  const qc = useQueryClient();
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState(r.note ?? "");
  const [error, setError] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: async (changes: { status?: OfferRequestStatus; note?: string | null }) => {
      const res = await fetch(`/api/admin/clients/offer-requests/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
    },
    onMutate: () => setError(null),
    onSuccess: () => {
      setNoteOpen(false);
      qc.invalidateQueries({ queryKey: OFFER_REQUESTS_KEY });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Update failed"),
  });

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{r.offerTitle}</span>
            <Badge variant="secondary">
              {r.kind === "book_call" ? <CalendarClock /> : <Send />}
              {r.kind === "book_call" ? "Book a call" : "Request info"}
            </Badge>
          </div>
          <p className="text-sm text-foreground">
            <Link href={`/dashboard/users/${r.userId}`} className="font-medium text-foreground underline-offset-4 hover:underline">
              {r.clientName || "Unknown client"}
            </Link>
            <span className="text-muted-foreground">
              {" "}
              · {formatDate(r.createdAt)}
              {r.viewCount > 0 && (
                <>
                  {" "}
                  · <Eye className="inline size-3.5 -translate-y-px" /> viewed {r.viewCount}×
                </>
              )}
            </span>
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {r.contactEmail &&
              (isPlainEmail(r.contactEmail) ? (
                <a href={`mailto:${r.contactEmail}`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                  <Mail className="size-3.5" />
                  {r.contactEmail}
                </a>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Mail className="size-3.5" />
                  {r.contactEmail}
                </span>
              ))}
            {r.contactPhone && (
              <a href={`tel:${r.contactPhone}`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                <Phone className="size-3.5" />
                {r.contactPhone}
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={r.status}
            disabled={update.isPending}
            onValueChange={(v) => update.mutate({ status: v as OfferRequestStatus })}
          >
            <SelectTrigger
              aria-label="Request status"
              className={cn("h-8 w-auto gap-1.5 border text-xs font-medium", badgeTone[STATUS_TONE[r.status]])}
            >
              <BadgeDot tone={STATUS_TONE[r.status]} />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OFFER_REQUEST_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {OFFER_REQUEST_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" onClick={() => setNoteOpen((o) => !o)}>
            {r.note ? "Edit note" : "Add note"}
          </Button>
        </div>
      </div>

      {r.message && (
        <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-muted/50 px-3 py-2 text-sm text-foreground">{r.message}</p>
      )}
      {r.note && !noteOpen && (
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Note:</span> {r.note}
          {r.updatedByName && <span className="opacity-70"> — {r.updatedByName}</span>}
        </p>
      )}
      {noteOpen && (
        <div className="mt-3 space-y-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Follow-up notes for the team…"
          />
          <Button type="button" size="sm" disabled={update.isPending} onClick={() => update.mutate({ note: note.trim() || null })}>
            Save note
          </Button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </Card>
  );
}
