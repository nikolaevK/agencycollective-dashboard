"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2, Users } from "lucide-react";
import {
  useGhlContactById,
  useGhlContacts,
  useGhlPipelines,
  useGhlTags,
  useGhlUsers,
  useGhlWorkflows,
} from "@/hooks/useGhlContacts";
import {
  DEFAULT_UI_SUB_ACCOUNT_ID,
  SUB_ACCOUNTS,
  isValidSubAccountId,
  type GhlSubAccountId,
} from "@/lib/ghl/subAccounts";
import { cn } from "@/lib/utils";
import { GhlSubAccountProvider } from "./GhlSubAccountContext";
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
  // with `?selected={contactId}`, `?q={searchTerm}`, and/or
  // `?subAccount={id}` to pre-select the contact, pre-fill the search box,
  // and switch to the right sub-account tab. Read once on mount;
  // subsequent navigation is local-state driven.
  const searchParams = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = useState(() => searchParams?.get("q") ?? "");
  const [activeSub, setActiveSub] = useState<GhlSubAccountId>(() => {
    const raw = searchParams?.get("subAccount");
    return isValidSubAccountId(raw) ? raw : DEFAULT_UI_SUB_ACCOUNT_ID;
  });
  // Selection lives at this level — not in the inner component — because the
  // inner remounts on tab switch (`key={activeSub}`), and if selectedId were
  // re-read from `useSearchParams()` at that point it would be stale: the
  // `router.replace` in `switchSub` queues a URL update but doesn't apply
  // synchronously, so the new inner would mount with the PREVIOUS tab's
  // selected id, fire `useGhlContactById` against the new sub-account's PIT,
  // and 403 because the contact belongs to the other location.
  const [selectedId, setSelectedIdState] = useState<string | null>(
    () => searchParams?.get("selected") ?? null
  );

  // Wrap setSelectedId to mirror it into the URL so deep-link sharing keeps
  // working after the user clicks around.
  const setSelectedId = useCallback(
    (next: string | null) => {
      setSelectedIdState(next);
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (next) params.set("selected", next);
      else params.delete("selected");
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [searchParams, router]
  );

  const switchSub = useCallback(
    (next: GhlSubAccountId) => {
      if (next === activeSub) return;
      // Clear selection FIRST so the inner remount doesn't even briefly
      // render with a stale id from the prior sub-account. The URL update is
      // async; the state update is sync.
      setSelectedIdState(null);
      setActiveSub(next);
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("subAccount", next);
      params.delete("selected");
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [activeSub, searchParams, router]
  );

  return (
    <div className="space-y-3">
      <GhlSubAccountTabs active={activeSub} onChange={switchSub} />
      <GhlSubAccountProvider value={activeSub}>
        <GhlContactsViewInner
          key={activeSub}
          activeSub={activeSub}
          query={query}
          setQuery={setQuery}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
        />
      </GhlSubAccountProvider>
    </div>
  );
}

// Filter/sort state is per-tab — the available tags/pipelines/sources differ
// between sub-accounts. The `key` on this component forces a clean remount
// on tab change so we don't have to manually clear every Set. `selectedId`
// is controlled by the outer component so we can clear it synchronously
// when the user switches sub-accounts (see comment in GhlContactsView).
function GhlContactsViewInner({
  activeSub,
  query,
  setQuery,
  selectedId,
  setSelectedId,
}: {
  activeSub: GhlSubAccountId;
  query: string;
  setQuery: (q: string) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}) {
  // Default to "Recently added" so the visible list mirrors the server's
  // newest-first pagination order — older contacts only appear when the user
  // scrolls and triggers more pages.
  const [sort, setSort] = useState<SortKey>("recent");
  const [stale, setStale] = useState<StaleKey>("any");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

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
  const contactsQuery = useGhlContacts(query, activeSub);
  const tagsQuery = useGhlTags(activeSub);
  const usersQuery = useGhlUsers(activeSub);
  const pipelinesQuery = useGhlPipelines(activeSub);
  const workflowsQuery = useGhlWorkflows(activeSub);

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
    selectedId && !selectedFromList ? selectedId : null,
    activeSub
  );

  const selectedContact = selectedFromList ?? directQuery.data ?? null;

  return (
    <div
      className={
        "flex flex-col rounded-xl border border-border/60 bg-card overflow-hidden " +
        "h-[calc(100vh-15rem)] md:flex-row"
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

function GhlSubAccountTabs({
  active,
  onChange,
}: {
  active: GhlSubAccountId;
  onChange: (id: GhlSubAccountId) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-muted/30 p-1">
      {SUB_ACCOUNTS.map((sub) => (
        <button
          key={sub.id}
          type="button"
          onClick={() => onChange(sub.id)}
          aria-pressed={active === sub.id}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            active === sub.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <span
            className={cn(
              "inline-flex items-center justify-center rounded px-1.5 py-0 text-[9px] font-bold border",
              sub.badgeClass
            )}
          >
            {sub.shortLabel}
          </span>
          {sub.label}
        </button>
      ))}
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
  // GHL returns 404 for ids that don't exist; 403 typically means the id
  // belongs to a different sub-account than the currently-active tab.
  const is404 = /\b404\b|not found/i.test(message);
  const is403 = /\b403\b/.test(message);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-500" />
      <div className="space-y-1 max-w-sm">
        <p className="text-sm font-medium text-foreground">
          {is404
            ? "Contact not found in GHL"
            : is403
            ? "Contact lives in a different sub-account"
            : "Couldn’t load this contact"}
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {is404
            ? `The id "${contactId}" doesn't match any contact in this sub-account. The contact may have been deleted, or the link came from a different tenant — try switching tabs.`
            : is403
            ? `The id "${contactId}" exists in another sub-account. Switch tabs above to open it.`
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
