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

const STATUS_STYLES: Record<OfferRequestStatus, string> = {
  new: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30",
  contacted: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
  won: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  lost: "bg-muted text-muted-foreground border-border",
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
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const count = rows.filter((r) => matches(f.id, r.status)).length;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm font-semibold transition-colors",
                filter === f.id
                  ? "border-transparent bg-foreground text-background"
                  : "border-border/60 text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label} <span className="opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/60" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <Inbox className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {rows.length === 0
              ? "No requests yet. They appear here when a client hits Request info or Book a call."
              : "Nothing in this view."}
          </p>
        </div>
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
    <div className="rounded-xl border border-border/50 bg-card p-4 dark:border-white/[0.06]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-foreground">{r.offerTitle}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {r.kind === "book_call" ? <CalendarClock className="h-3 w-3" /> : <Send className="h-3 w-3" />}
              {r.kind === "book_call" ? "Book a call" : "Request info"}
            </span>
          </div>
          <p className="text-sm text-foreground">
            <Link href={`/dashboard/users/${r.userId}`} className="font-semibold text-primary hover:underline">
              {r.clientName || "Unknown client"}
            </Link>
            <span className="text-muted-foreground">
              {" "}
              · {formatDate(r.createdAt)}
              {r.viewCount > 0 && (
                <>
                  {" "}
                  · <Eye className="inline h-3.5 w-3.5 -translate-y-px" /> viewed {r.viewCount}×
                </>
              )}
            </span>
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {r.contactEmail &&
              (isPlainEmail(r.contactEmail) ? (
                <a href={`mailto:${r.contactEmail}`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  {r.contactEmail}
                </a>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  {r.contactEmail}
                </span>
              ))}
            {r.contactPhone && (
              <a href={`tel:${r.contactPhone}`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                <Phone className="h-3.5 w-3.5" />
                {r.contactPhone}
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={r.status}
            disabled={update.isPending}
            onChange={(e) => update.mutate({ status: e.target.value as OfferRequestStatus })}
            aria-label="Request status"
            className={cn(
              "rounded-lg border px-2.5 py-1.5 text-xs font-bold outline-none",
              STATUS_STYLES[r.status]
            )}
          >
            {OFFER_REQUEST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {OFFER_REQUEST_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setNoteOpen((o) => !o)}
            className="rounded-lg border border-border/60 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            {r.note ? "Edit note" : "Add note"}
          </button>
        </div>
      </div>

      {r.message && (
        <p className="mt-3 whitespace-pre-wrap rounded-lg bg-muted/50 px-3 py-2 text-sm text-foreground">{r.message}</p>
      )}
      {r.note && !noteOpen && (
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Note:</span> {r.note}
          {r.updatedByName && <span className="opacity-70"> — {r.updatedByName}</span>}
        </p>
      )}
      {noteOpen && (
        <div className="mt-3 space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Follow-up notes for the team…"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            type="button"
            disabled={update.isPending}
            onClick={() => update.mutate({ note: note.trim() || null })}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            Save note
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
