import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  GhlContact,
  GhlContactAppointment,
  GhlContactBatch,
  GhlContactNote,
  GhlContactRef,
  GhlConversation,
  GhlMessage,
  GhlPipeline,
  GhlTag,
  GhlUser,
  GhlWorkflow,
} from "@/types/ghl";

interface CrossReferenceResult {
  byGoogleEventId: Record<string, GhlContactRef | null>;
}

export interface CrossReferenceEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
}

interface ApiEnvelope<T> { data: T; error?: string; code?: string }

async function fetchJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    // Network error (offline, DNS, CORS preflight failure). Surface a
    // legible message instead of the raw "Failed to fetch" string.
    throw new Error(
      `Network error contacting ${url}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  let json: ApiEnvelope<T> | null = null;
  try {
    json = (await res.json()) as ApiEnvelope<T>;
  } catch {
    // Server returned non-JSON (HTML error page, empty body). Don't mask
    // the HTTP status with a JSON parse failure.
  }
  if (!res.ok) {
    throw new Error(json?.error || `Request failed (${res.status})`);
  }
  if (!json) throw new Error(`Empty response from ${url}`);
  return json.data;
}

const PAGE_LIMIT = 100;

/**
 * Paginated newest-first contact loader. Loads page 1 immediately; subsequent
 * pages are fetched on demand by the caller via `fetchNextPage()` (typically
 * triggered by an IntersectionObserver near the bottom of the list).
 *
 * Cost note: each page is ~5s of GHL work (search + per-contact notes +
 * conversation summaries). Users who only inspect recent contacts pay one
 * page; deeper exploration loads more on scroll. This replaces the previous
 * auto-fetch-all behaviour which paid the full cost up front.
 */
export function useGhlContacts(query: string) {
  return useInfiniteQuery<GhlContactBatch, Error, { pages: GhlContactBatch[]; pageParams: number[] }, [string, string], number>({
    queryKey: ["ghl-contacts", query],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const search = new URLSearchParams({
        query,
        page: String(pageParam),
        pageLimit: String(PAGE_LIMIT),
      });
      return fetchJson<GhlContactBatch>(`/api/ghl/contacts?${search.toString()}`);
    },
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    staleTime: 5 * 60_000,
    // Don't retry on 4xx — those are user/scope errors, not transient. Other
    // failures get one retry.
    retry: (count, err) => count < 1 && !/^Request failed \(40/.test(err.message),
  });
}

/**
 * Fetch a single contact by id directly. Used by the deep-link path
 * (clicking a calendar chip) where the target contact may not be in the
 * currently-loaded paginated list.
 */
export function useGhlContactById(contactId: string | null) {
  return useQuery<GhlContact>({
    queryKey: ["ghl-contact-by-id", contactId],
    queryFn: () =>
      fetchJson<GhlContact>(`/api/ghl/contacts/${encodeURIComponent(contactId!)}`),
    enabled: Boolean(contactId),
    staleTime: 5 * 60_000,
  });
}

export function useGhlContactNotes(contactId: string | null) {
  return useQuery<GhlContactNote[]>({
    queryKey: ["ghl-contact-notes", contactId],
    queryFn: () =>
      fetchJson<GhlContactNote[]>(`/api/ghl/contacts/${encodeURIComponent(contactId!)}/notes`),
    enabled: Boolean(contactId),
    staleTime: 60_000,
  });
}

/**
 * Create a note on a contact. On success:
 *   - invalidates the per-contact notes list (refetches the chronological list)
 *   - invalidates `["ghl-contacts"]` so the row's noteCount badge updates
 */
export function useCreateGhlNote(contactId: string | null) {
  const queryClient = useQueryClient();
  return useMutation<GhlContactNote, Error, { body: string }>({
    mutationFn: async ({ body }) => {
      if (!contactId) throw new Error("No contact selected");
      const res = await fetch(
        `/api/ghl/contacts/${encodeURIComponent(contactId)}/notes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        }
      );
      let json: ApiEnvelope<GhlContactNote> | null = null;
      try {
        json = (await res.json()) as ApiEnvelope<GhlContactNote>;
      } catch {
        // non-JSON error response — fall through to status check
      }
      if (!res.ok) {
        throw new Error(json?.error || `Request failed (${res.status})`);
      }
      if (!json) throw new Error("Empty response");
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ghl-contact-notes", contactId] });
      queryClient.invalidateQueries({ queryKey: ["ghl-contacts"] });
    },
  });
}

export function useGhlContactAppointments(contactId: string | null) {
  return useQuery<GhlContactAppointment[]>({
    queryKey: ["ghl-contact-appointments", contactId],
    queryFn: () =>
      fetchJson<GhlContactAppointment[]>(
        `/api/ghl/contacts/${encodeURIComponent(contactId!)}/appointments`
      ),
    enabled: Boolean(contactId),
    staleTime: 60_000,
  });
}

// Catalog queries — tags, users, pipelines, workflows — change rarely. Long
// staleTime + gcTime keeps them around across navigation so the user
// doesn't pay refetch cost when re-entering the GHL surface.
const CATALOG_OPTIONS = {
  staleTime: 15 * 60_000, // 15 min: data is considered fresh
  gcTime: 30 * 60_000,    // 30 min: cache survives this long after last subscriber
} as const;

export function useGhlTags() {
  return useQuery<GhlTag[]>({
    queryKey: ["ghl-tags"],
    queryFn: () => fetchJson<GhlTag[]>("/api/ghl/tags"),
    ...CATALOG_OPTIONS,
  });
}

export function useGhlUsers() {
  return useQuery<Record<string, GhlUser>>({
    queryKey: ["ghl-users"],
    queryFn: () => fetchJson<Record<string, GhlUser>>("/api/ghl/users"),
    ...CATALOG_OPTIONS,
  });
}

export function useGhlPipelines() {
  return useQuery<GhlPipeline[]>({
    queryKey: ["ghl-pipelines"],
    queryFn: () => fetchJson<GhlPipeline[]>("/api/ghl/pipelines"),
    ...CATALOG_OPTIONS,
  });
}

export function useGhlWorkflows() {
  return useQuery<GhlWorkflow[]>({
    queryKey: ["ghl-workflows"],
    queryFn: () => fetchJson<GhlWorkflow[]>("/api/ghl/workflows"),
    ...CATALOG_OPTIONS,
  });
}

export function useGhlContactConversations(contactId: string | null) {
  return useQuery<GhlConversation[]>({
    queryKey: ["ghl-contact-conversations", contactId],
    queryFn: () =>
      fetchJson<GhlConversation[]>(
        `/api/ghl/contacts/${encodeURIComponent(contactId!)}/conversations`
      ),
    enabled: Boolean(contactId),
    staleTime: 60_000,
  });
}

/**
 * Resolve Google Calendar events to GHL contacts via a composite (title +
 * startTime + endTime) match against GHL appointments. Strict — no email
 * fallback (those produced false positives in production).
 *
 * Why composite-key not id: GHL's appointment payload doesn't expose the
 * synced Google Calendar event id. Title + start/end form a strict join
 * because GHL preserves them exactly when syncing to Google.
 */
export function useGhlCrossReference(input: { events: CrossReferenceEvent[] }) {
  // Stable cache key from sorted ids. Two consumers asking about the same
  // set of events share one fetch even if the array references differ.
  const key = [...input.events]
    .map((e) => e.id)
    .sort()
    .join("|");

  return useQuery<CrossReferenceResult>({
    queryKey: ["ghl-cross-ref", key],
    queryFn: async () => {
      const res = await fetch("/api/ghl/cross-reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: input.events }),
      });
      const json = (await res.json()) as ApiEnvelope<CrossReferenceResult>;
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      return json.data;
    },
    enabled: input.events.length > 0,
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
  });
}

export function useGhlConversationMessages(conversationId: string | null) {
  return useQuery<GhlMessage[]>({
    queryKey: ["ghl-conversation-messages", conversationId],
    queryFn: () =>
      fetchJson<GhlMessage[]>(
        `/api/ghl/conversations/${encodeURIComponent(conversationId!)}/messages`
      ),
    enabled: Boolean(conversationId),
    staleTime: 60_000,
  });
}
