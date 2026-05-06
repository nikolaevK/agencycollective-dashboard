"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2, Users } from "lucide-react";
import {
  useGhlContactById,
  useGhlContacts,
  useGhlPipelines,
  useGhlTags,
  useGhlUsers,
  useGhlWorkflows,
} from "@/hooks/useGhlContacts";
// useGhlWorkflows still used by detail pane (Tags & Info → Active workflows
// resolves the contact's workflow ids against the catalog when present).
import {
  GhlContactList,
  type FilterKey,
  type SortKey,
  type StaleKey,
  type StatusKey,
} from "./GhlContactList";
import { GhlContactDetail } from "./GhlContactDetail";
import type { GhlPipeline, GhlTag, GhlUser, GhlWorkflow } from "@/types/ghl";

// Module-level frozen empty fallbacks. Using `tagsQuery.data ?? []` directly
// would create a fresh `[]` literal on every render, defeating the shallow
// prop-identity comparison in every memoized child below. These constants
// give us stable references so React.memo can do its job.
const EMPTY_TAGS: GhlTag[] = [];
const EMPTY_PIPELINES: GhlPipeline[] = [];
const EMPTY_WORKFLOWS: GhlWorkflow[] = [];
const EMPTY_USERS: Record<string, GhlUser> = {};

function useToggleSet<T>(): {
  set: Set<T>;
  toggle: (v: T) => void;
  clear: () => void;
} {
  const [set, setSet] = useState<Set<T>>(() => new Set());
  const toggle = useCallback((v: T) => {
    setSet((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }, []);
  const clear = useCallback(() => setSet(new Set()), []);
  return { set, toggle, clear };
}

export function GhlContactsView() {
  // Deep-link support: a calendar chip (or any external link) can land here
  // with `?selected={contactId}` and/or `?q={searchTerm}` to pre-select the
  // contact and pre-fill the search box. Read once on mount; subsequent
  // navigation is local-state driven.
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams?.get("q") ?? "");
  // Default to "Recently added" so the visible list mirrors the server's
  // newest-first pagination order — older contacts only appear when the user
  // scrolls and triggers more pages.
  const [sort, setSort] = useState<SortKey>("recent");
  const [stale, setStale] = useState<StaleKey>("any");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    () => searchParams?.get("selected") ?? null
  );

  // Every filter set composes with AND — they don't overwrite each other.
  const filters = useToggleSet<FilterKey>();
  const statuses = useToggleSet<StatusKey>();
  const tags = useToggleSet<string>();
  const stages = useToggleSet<string>();
  const sources = useToggleSet<string>();

  // The `<SearchBox>` inside GhlContactList already debounces its commit
  // upward — by the time `query` reaches us it's already settled. Passing
  // it straight into the React Query hook means typing doesn't trigger
  // a re-render of this view tree until the 250ms debounce elapses.
  const contactsQuery = useGhlContacts(query);
  const tagsQuery = useGhlTags();
  const usersQuery = useGhlUsers();
  const pipelinesQuery = useGhlPipelines();
  const workflowsQuery = useGhlWorkflows();

  const contacts = useMemo(
    () => contactsQuery.data?.pages.flatMap((p) => p.contacts) ?? [],
    [contactsQuery.data]
  );
  const total = contactsQuery.data?.pages[0]?.total ?? 0;
  const loaded = contacts.length;

  // First, look the contact up in the already-loaded paginated list.
  const selectedFromList = useMemo(
    () => (selectedId ? contacts.find((c) => c.id === selectedId) ?? null : null),
    [contacts, selectedId]
  );

  // Fallback for deep links: if `?selected=...` references a contact that
  // hasn't been paginated into view yet (likely — the list is bounded to
  // recently-added contacts), fetch it directly by id. Disabled when we
  // already have it from the list.
  const directQuery = useGhlContactById(
    selectedId && !selectedFromList ? selectedId : null
  );

  const selectedContact = selectedFromList ?? directQuery.data ?? null;

  return (
    <div
      className={
        "flex flex-col rounded-xl border border-border/60 bg-card overflow-hidden " +
        "h-[calc(100vh-12rem)] md:flex-row"
      }
    >
      <div className="md:w-80 lg:w-96 shrink-0 border-b border-border/60 md:border-b-0 md:border-r md:h-full h-[55vh] min-w-0">
        <GhlContactList
          query={query}
          setQuery={setQuery}
          filters={filters.set}
          toggleFilter={filters.toggle}
          clearFilters={filters.clear}
          statuses={statuses.set}
          toggleStatus={statuses.toggle}
          stale={stale}
          setStale={setStale}
          selectedTags={tags.set}
          toggleTag={tags.toggle}
          clearTags={tags.clear}
          availableTags={tagsQuery.data ?? EMPTY_TAGS}
          selectedStageIds={stages.set}
          toggleStage={stages.toggle}
          clearStages={stages.clear}
          pipelines={pipelinesQuery.data ?? EMPTY_PIPELINES}
          selectedSources={sources.set}
          toggleSource={sources.toggle}
          clearSources={sources.clear}
          sort={sort}
          setSort={setSort}
          fromDate={fromDate}
          setFromDate={setFromDate}
          toDate={toDate}
          setToDate={setToDate}
          contacts={contacts}
          total={total}
          loaded={loaded}
          isLoading={contactsQuery.isLoading}
          isFetchingNextPage={contactsQuery.isFetchingNextPage}
          hasNextPage={contactsQuery.hasNextPage ?? false}
          fetchNextPage={contactsQuery.fetchNextPage}
          error={contactsQuery.error as Error | null}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        {selectedContact ? (
          <GhlContactDetail
            contact={selectedContact}
            users={usersQuery.data ?? EMPTY_USERS}
            pipelines={pipelinesQuery.data ?? EMPTY_PIPELINES}
            workflows={workflowsQuery.data ?? EMPTY_WORKFLOWS}
          />
        ) : selectedId && directQuery.isLoading ? (
          <LoadingContact />
        ) : selectedId && directQuery.isError ? (
          <NotFoundContact
            contactId={selectedId}
            error={directQuery.error}
            onClear={() => setSelectedId(null)}
          />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <Users className="h-10 w-10 text-muted-foreground/50" />
      <div>
        <p className="text-sm font-medium text-foreground">Select a contact</p>
        <p className="text-xs text-muted-foreground mt-1">
          Pick someone from the list to see their notes, appointments, opportunities, and messages.
        </p>
      </div>
    </div>
  );
}

function LoadingContact() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      <p className="text-sm">Loading contact…</p>
    </div>
  );
}

function NotFoundContact({
  contactId,
  error,
  onClear,
}: {
  contactId: string;
  error: unknown;
  onClear: () => void;
}) {
  const message = error instanceof Error ? error.message : "";
  // GHL returns 404 for ids that don't exist; everything else is a transient
  // failure worth showing distinctly.
  const is404 = /\b404\b|not found/i.test(message);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-500" />
      <div className="space-y-1 max-w-sm">
        <p className="text-sm font-medium text-foreground">
          {is404 ? "Contact not found in GHL" : "Couldn’t load this contact"}
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {is404
            ? `The id "${contactId}" doesn't match any contact in your GHL location. The contact may have been deleted, or the link came from a different tenant.`
            : message || "Try again in a moment, or pick a contact from the list."}
        </p>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="text-xs text-muted-foreground hover:text-foreground underline"
      >
        Back to list
      </button>
    </div>
  );
}
