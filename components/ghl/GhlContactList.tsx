"use client";

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Loader2,
  AlertTriangle,
  StickyNote,
  CalendarClock,
  CalendarCheck2,
  Tags,
  Check,
  ChevronDown,
  GitBranch,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, BadgeDot, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Toggle } from "@/components/ui/toggle";
import type { GhlContact, GhlPipeline, GhlTag } from "@/types/ghl";

// "all" is no longer a filter key — an empty `filters` set means "show all
// contacts that match the rest of the criteria." Each remaining pill is
// independently togglable so they can stack with AND semantics alongside
// status / tags / pipeline / source / stale / date-range filters.
export type FilterKey = "upcoming" | "past" | "no-appt" | "has-notes";
export type StatusKey = "confirmed" | "showed" | "noshow" | "cancelled";
export type StaleKey = "any" | "le7" | "le14" | "le30" | "gt30";
export type SortKey = "next-appt" | "last-appt" | "name" | "recent" | "stale";

interface Props {
  // search + primary filters (multi-select)
  query: string;
  setQuery: (q: string) => void;
  filters: Set<FilterKey>;
  toggleFilter: (f: FilterKey) => void;
  clearFilters: () => void;

  // appointment status pills
  statuses: Set<StatusKey>;
  toggleStatus: (s: StatusKey) => void;

  // staleness
  stale: StaleKey;
  setStale: (s: StaleKey) => void;

  // pickers (multi-select)
  selectedTags: Set<string>;
  toggleTag: (t: string) => void;
  clearTags: () => void;
  availableTags: GhlTag[];

  selectedStageIds: Set<string>; // "pipelineId|stageId"
  toggleStage: (id: string) => void;
  clearStages: () => void;
  pipelines: GhlPipeline[];

  selectedSources: Set<string>;
  toggleSource: (s: string) => void;
  clearSources: () => void;

  // sort + date range
  sort: SortKey;
  setSort: (s: SortKey) => void;
  fromDate: string;
  setFromDate: (d: string) => void;
  toDate: string;
  setToDate: (d: string) => void;

  // data
  contacts: GhlContact[];
  total: number;
  loaded: number;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  error: Error | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "no-appt", label: "No appt" },
  { key: "has-notes", label: "Has notes" },
];

const STATUSES: { key: StatusKey; label: string; matches: (s: string) => boolean }[] = [
  { key: "confirmed", label: "Confirmed", matches: (s) => s === "confirmed" },
  { key: "showed", label: "Showed", matches: (s) => s === "showed" || s === "show" },
  {
    key: "noshow",
    label: "No-show",
    matches: (s) => s === "noshow" || s === "no-show" || s === "no_show",
  },
  {
    key: "cancelled",
    label: "Cancelled",
    matches: (s) => s === "cancelled" || s === "canceled",
  },
];

const STALE_OPTIONS: { key: StaleKey; label: string }[] = [
  { key: "any", label: "Any age" },
  { key: "le7", label: "Updated ≤ 7d" },
  { key: "le14", label: "Updated ≤ 14d" },
  { key: "le30", label: "Updated ≤ 30d" },
  { key: "gt30", label: "Stale > 30d" },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "next-appt", label: "Next appt" },
  { key: "last-appt", label: "Last appt" },
  { key: "name", label: "Name" },
  { key: "recent", label: "Recently added" },
  { key: "stale", label: "Most stale" },
];

export function GhlContactList(props: Props) {
  // useDeferredValue lets React keep the input/scroll responsive while the
  // expensive `filterAndSort` is recomputed during a transition. At small
  // contact counts it's a no-op; at higher loads (multiple loaded pages,
  // heavy filter compositions) the UI stops jankin'.
  const deferredContacts = useDeferredValue(props.contacts);

  const visible = useMemo(
    () => filterAndSort({ ...props, contacts: deferredContacts }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      deferredContacts,
      props.filters,
      props.statuses,
      props.stale,
      props.selectedTags,
      props.selectedStageIds,
      props.selectedSources,
      props.sort,
      props.fromDate,
      props.toDate,
    ]
  );

  // Resolve each visible contact's stage indicator ONCE per (contacts,
  // pipelines) change instead of inside every row's render. Keys by
  // contact.id so React.memo on `ContactRow` keeps stable identity for
  // unchanged rows.
  const stageViewByContact = useMemo(() => {
    const map = new Map<string, StageView | null>();
    for (const c of props.contacts) {
      map.set(c.id, computeStageView(c, props.pipelines));
    }
    return map;
  }, [props.contacts, props.pipelines]);

  // Sources derived from loaded contacts so the picker only shows what's
  // actually present — saves the user from picking a source that returns 0.
  const availableSources = useMemo(() => {
    const set = new Set<string>();
    for (const c of props.contacts) {
      if (c.source && c.source.trim()) set.add(c.source.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [props.contacts]);

  return (
    <div className="flex h-full flex-col min-w-0">
      <div className="border-b p-3 space-y-2 min-w-0">
        {/* Search — internal state with debounced commit upward, so each
            keystroke doesn't re-render the entire view. */}
        <SearchBox initialValue={props.query} onSearch={props.setQuery} />

        {/* Primary filters (multi-select; combine with AND alongside the
            status/tag/pipeline/source/stale/date filters below). */}
        <div className="flex flex-wrap items-center gap-1">
          {FILTERS.map((f) => {
            const on = props.filters.has(f.key);
            return (
              <Toggle
                key={f.key}
                variant="outline"
                size="sm"
                pressed={on}
                onPressedChange={() => props.toggleFilter(f.key)}
                className="h-7 px-2.5 text-xs"
              >
                {f.label}
              </Toggle>
            );
          })}
          {props.filters.size > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={props.clearFilters}
              className="ml-auto text-muted-foreground"
            >
              clear
            </Button>
          )}
        </div>

        {/* Appointment status (multi-select) */}
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((s) => {
            const on = props.statuses.has(s.key);
            return (
              <Toggle
                key={s.key}
                variant="outline"
                size="sm"
                pressed={on}
                onPressedChange={() => props.toggleStatus(s.key)}
                className="h-7 px-2.5 text-xs"
              >
                {on && <Check className="size-3" />}
                {s.label}
              </Toggle>
            );
          })}
        </div>

        {/* Pickers row */}
        <div className="flex flex-wrap items-center gap-1.5">
          <FlatPickerButton
            icon={Tags}
            label="Tags"
            count={props.selectedTags.size}
            items={props.availableTags.map((t) => ({ id: t.name, label: t.name }))}
            selected={props.selectedTags}
            onToggle={props.toggleTag}
            onClear={props.clearTags}
            emptyMessage="No tags found in GHL."
          />
          <PipelinePickerButton
            pipelines={props.pipelines}
            selectedStageIds={props.selectedStageIds}
            onToggle={props.toggleStage}
            onClear={props.clearStages}
          />
          <FlatPickerButton
            icon={Globe}
            label="Source"
            count={props.selectedSources.size}
            items={availableSources.map((s) => ({ id: s, label: s }))}
            selected={props.selectedSources}
            onToggle={props.toggleSource}
            onClear={props.clearSources}
            emptyMessage="No sources on loaded contacts yet."
          />
        </div>

        {/* Sort + Stale + Date range */}
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <Select value={props.sort} onValueChange={(v) => props.setSort(v as SortKey)}>
            <SelectTrigger aria-label="Sort" className="h-8 w-auto min-w-0 max-w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  Sort: {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={props.stale} onValueChange={(v) => props.setStale(v as StaleKey)}>
            <SelectTrigger aria-label="Last activity" className="h-8 w-auto min-w-0 max-w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STALE_OPTIONS.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DatePicker
            value={props.fromDate}
            onValueChange={props.setFromDate}
            aria-label="From date"
            placeholder="From date"
            className="h-8 w-[8.5rem] text-xs"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <DatePicker
            value={props.toDate}
            onValueChange={props.setToDate}
            aria-label="To date"
            placeholder="To date"
            className="h-8 w-[8.5rem] text-xs"
          />
          {(props.fromDate || props.toDate) && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => {
                props.setFromDate("");
                props.setToDate("");
              }}
              className="text-muted-foreground"
            >
              clear
            </Button>
          )}
        </div>
      </div>

      {/* List body */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {props.error ? (
          <ErrorState message={props.error.message} />
        ) : props.isLoading ? (
          <ListSkeleton />
        ) : visible.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {props.contacts.length === 0
              ? `No contacts ${props.query ? `match “${props.query}”` : "loaded yet"}.`
              : props.hasNextPage
              ? "No loaded contacts match the current filters — scroll to load more."
              : "No contacts match the current filters."}
          </div>
        ) : (
          <>
            <ul className="divide-y">
              {visible.map((c) => (
                <ContactRow
                  key={c.id}
                  contact={c}
                  isActive={c.id === props.selectedId}
                  onSelect={props.onSelect}
                  stageView={stageViewByContact.get(c.id) ?? null}
                />
              ))}
            </ul>
            <LoadMoreSentinel
              hasNextPage={props.hasNextPage}
              isFetchingNextPage={props.isFetchingNextPage}
              fetchNextPage={props.fetchNextPage}
            />
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
        <span className="truncate">
          {props.isFetchingNextPage && <Loader2 className="inline size-3 animate-spin mr-1" />}
          {visible.length} shown · {props.loaded.toLocaleString()} loaded
          {props.total > props.loaded && (
            <span className="ml-1 opacity-70">
              of {props.total.toLocaleString()} in GHL
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

// ── Load-more sentinel ──────────────────────────────────────────────
//
// Renders an invisible 1px element below the list. When it scrolls into
// view (within rootMargin), we trigger fetchNextPage. This is the standard
// "infinite scroll" pattern — the user pulls in more recent-to-older pages
// only when they actually need them.
function LoadMoreSentinel({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !hasNextPage || isFetchingNextPage) return;
    if (typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          fetchNextPage();
        }
      },
      // Pre-fetch slightly before the sentinel reaches the viewport so the
      // next page is already loading by the time the user gets there.
      { rootMargin: "200px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (!hasNextPage) {
    return (
      <div className="px-3 py-3 text-center text-[10px] text-muted-foreground/70">
        End of list
      </div>
    );
  }

  return (
    <div ref={ref} className="px-3 py-3 text-center">
      {isFetchingNextPage ? (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          Loading older contacts…
        </span>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={fetchNextPage}
          className="text-muted-foreground"
        >
          Load older contacts
        </Button>
      )}
    </div>
  );
}

// ── Search box ──────────────────────────────────────────────────────
//
// Local input state with a debounced commit upward. Critical for perf:
// without this, every keystroke re-renders `GhlContactsView` →
// `GhlContactList` → all controls. With this, only the input itself
// re-renders on each keystroke; the parent tree only re-renders after the
// 250ms debounce, when the actual search query is committed.
const SearchBox = memo(function SearchBox({
  initialValue,
  onSearch,
}: {
  initialValue: string;
  onSearch: (q: string) => void;
}) {
  const [local, setLocal] = useState(initialValue);

  useEffect(() => {
    // No-op on mount and on external sync (parent's value matches ours).
    if (local === initialValue) return;
    const t = setTimeout(() => onSearch(local), 250);
    return () => clearTimeout(t);
  }, [local, initialValue, onSearch]);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder="Search by name, email, phone…"
        className="pl-9"
      />
    </div>
  );
});

// ── Pickers ──────────────────────────────────────────────────────────

function FlatPickerButton({
  icon: Icon,
  label,
  count,
  items,
  selected,
  onToggle,
  onClear,
  emptyMessage,
}: {
  icon: typeof Tags;
  label: string;
  count: number;
  items: { id: string; label: string }[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onClear: () => void;
  emptyMessage: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.label.toLowerCase().includes(q));
  }, [items, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("h-7 px-2.5 text-xs", count > 0 && "bg-muted dark:bg-muted")}
        >
          <Icon className="size-3.5" />
          {label}
          {count > 0 && (
            <Badge variant="outline" className="ml-0.5 h-4 bg-background px-1.5 text-[10px] tabular-nums">
              {count}
            </Badge>
          )}
          <ChevronDown className="size-3 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[calc(100vw-1.5rem)] sm:w-72 overflow-hidden p-0">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Filter ${label.toLowerCase()}…`}
              className="h-8 pl-8"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              {items.length === 0 ? emptyMessage : "No matches."}
            </p>
          ) : (
            filtered.map((it) => {
              const on = selected.has(it.id);
              return (
                <label
                  key={it.id}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-xs hover:bg-muted"
                >
                  <Checkbox checked={on} onCheckedChange={() => onToggle(it.id)} />
                  <span className="truncate">{it.label}</span>
                </label>
              );
            })
          )}
        </div>
        {count > 0 && (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => {
                onClear();
                setSearch("");
              }}
              className="text-muted-foreground"
            >
              Clear {count} selected
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function PipelinePickerButton({
  pipelines,
  selectedStageIds,
  onToggle,
  onClear,
}: {
  pipelines: GhlPipeline[];
  selectedStageIds: Set<string>;
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const count = selectedStageIds.size;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("h-7 px-2.5 text-xs", count > 0 && "bg-muted dark:bg-muted")}
        >
          <GitBranch className="size-3.5" />
          Pipeline
          {count > 0 && (
            <Badge variant="outline" className="ml-0.5 h-4 bg-background px-1.5 text-[10px] tabular-nums">
              {count}
            </Badge>
          )}
          <ChevronDown className="size-3 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[calc(100vw-1.5rem)] sm:w-80 overflow-hidden p-0">
        <div className="max-h-80 overflow-y-auto p-1.5">
          {pipelines.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              No pipelines found in GHL.
            </p>
          ) : (
            pipelines.map((p) => (
              <div key={p.id}>
                <p className="sticky top-0 z-10 bg-popover px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
                  {p.name}
                </p>
                {p.stages.length === 0 ? (
                  <p className="px-2.5 py-2 text-xs text-muted-foreground italic">No stages</p>
                ) : (
                  p.stages.map((s) => {
                    const id = `${p.id}|${s.id}`;
                    const on = selectedStageIds.has(id);
                    return (
                      <label
                        key={id}
                        className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-xs hover:bg-muted"
                      >
                        <Checkbox checked={on} onCheckedChange={() => onToggle(id)} />
                        <span className="truncate">{s.name}</span>
                      </label>
                    );
                  })
                )}
              </div>
            ))
          )}
        </div>
        {count > 0 && (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={onClear}
              className="text-muted-foreground"
            >
              Clear {count} selected
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── Filtering / sorting ──────────────────────────────────────────────

function statusMatcher(statuses: Set<StatusKey>): (s: string) => boolean {
  if (statuses.size === 0) return () => true;
  const matchers = STATUSES.filter((m) => statuses.has(m.key)).map((m) => m.matches);
  return (raw) => {
    const s = raw.toLowerCase();
    return matchers.some((m) => m(s));
  };
}

function ageDays(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Infinity;
  return (Date.now() - t) / 86_400_000;
}

function passesStale(stale: StaleKey, dateUpdated: string | null | undefined): boolean {
  if (stale === "any") return true;
  const d = ageDays(dateUpdated);
  if (stale === "le7") return d <= 7;
  if (stale === "le14") return d <= 14;
  if (stale === "le30") return d <= 30;
  return d > 30; // gt30
}

function filterAndSort(p: Props): GhlContact[] {
  const fromMs = p.fromDate ? Date.parse(p.fromDate + "T00:00:00") : null;
  const toMs = p.toDate ? Date.parse(p.toDate + "T23:59:59.999") : null;
  const matchStatus = statusMatcher(p.statuses);

  const filtered = p.contacts.filter((c) => {
    // Each primary filter contributes one AND clause when active. With
    // none active, all contacts pass this section.
    if (p.filters.has("no-appt") && (c.appointmentCount ?? 0) > 0) return false;
    if (p.filters.has("upcoming") && !c.nextAppointmentTime) return false;
    if (p.filters.has("past") && !c.lastAppointmentTime) return false;
    if (p.filters.has("has-notes") && (c.noteCount ?? 0) === 0) return false;

    if (p.selectedTags.size > 0 && !c.tags.some((t) => p.selectedTags.has(t))) return false;

    if (p.statuses.size > 0) {
      const apptStatuses = c.appointmentStatuses ?? [];
      if (!apptStatuses.some(matchStatus)) return false;
    }

    if (!passesStale(p.stale, c.dateUpdated)) return false;

    if (p.selectedStageIds.size > 0) {
      const opps = c.opportunities ?? [];
      if (!opps.some((o) => p.selectedStageIds.has(`${o.pipelineId}|${o.pipelineStageId}`))) {
        return false;
      }
    }

    if (p.selectedSources.size > 0) {
      const src = (c.source ?? "").trim();
      if (!p.selectedSources.has(src)) return false;
    }

    if (fromMs !== null || toMs !== null) {
      // Date range narrows whichever appointment slot the active primary
      // filters care about. With both Upcoming + Past selected, both slots
      // qualify (OR within the date check). With neither selected, both are
      // considered too — same as the previous default behavior.
      const candidates: (string | null | undefined)[] = [];
      if (p.filters.has("upcoming")) candidates.push(c.nextAppointmentTime);
      if (p.filters.has("past")) candidates.push(c.lastAppointmentTime);
      if (candidates.length === 0) {
        candidates.push(c.nextAppointmentTime, c.lastAppointmentTime);
      }

      const hit = candidates.some((iso) => {
        if (!iso) return false;
        const t = Date.parse(iso);
        if (!Number.isFinite(t)) return false;
        if (fromMs !== null && t < fromMs) return false;
        if (toMs !== null && t > toMs) return false;
        return true;
      });
      if (!hit) return false;
    }

    return true;
  });

  return filtered.sort(comparator(p.sort));
}

function comparator(sort: SortKey): (a: GhlContact, b: GhlContact) => number {
  if (sort === "name") {
    return (a, b) => displayName(a).localeCompare(displayName(b));
  }
  if (sort === "recent") {
    return (a, b) => time(b.dateAdded) - time(a.dateAdded);
  }
  if (sort === "stale") {
    // Most stale first — oldest dateUpdated. Undated contacts (time=0) sort
    // first as effectively-very-stale, which is what the UX expects.
    return (a, b) => time(a.dateUpdated) - time(b.dateUpdated);
  }
  if (sort === "last-appt") {
    return (a, b) => {
      const av = parseTime(a.lastAppointmentTime, -Infinity);
      const bv = parseTime(b.lastAppointmentTime, -Infinity);
      return bv - av;
    };
  }
  return (a, b) => {
    const av = parseTime(a.nextAppointmentTime, Infinity);
    const bv = parseTime(b.nextAppointmentTime, Infinity);
    if (av !== bv) return av - bv;
    return displayName(a).localeCompare(displayName(b));
  };
}

/** ISO → ms; null/empty/invalid → fallback. Guards against NaN poisoning sort comparators. */
function parseTime(iso: string | null | undefined, fallback: number): number {
  if (!iso) return fallback;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : fallback;
}

function time(iso?: string | null): number {
  return parseTime(iso, 0);
}

export function displayName(c: GhlContact): string {
  return (
    c.contactName?.trim() ||
    [c.firstName, c.lastName].filter(Boolean).join(" ").trim() ||
    c.email ||
    c.phone ||
    c.id
  );
}

// ── Row ──────────────────────────────────────────────────────────────

// Memoized: only re-renders when `contact`, `isActive`, `onSelect`, or
// `stageView` actually changes. The parent pre-resolves `stageView` from
// the `pipelines` catalog so this row never sees the volatile pipelines
// array directly — that prevents catalog refetches from invalidating the
// memo for every row at once.
type StageView = {
  label: string;
  status: "won" | "lost" | "abandoned" | "open";
  pipelineName: string;
};

const ContactRow = memo(function ContactRow({
  contact,
  isActive,
  onSelect,
  stageView,
}: {
  contact: GhlContact;
  isActive: boolean;
  onSelect: (id: string) => void;
  stageView: StageView | null;
}) {
  // Stable click handler — only changes when this row's id or the (stable)
  // `onSelect` setter changes. Without this each row would receive a fresh
  // arrow function from the parent and break memoization downstream.
  const handleClick = useCallback(() => onSelect(contact.id), [contact.id, onSelect]);

  const subtitle = [contact.email, contact.phone].filter(Boolean).join(" · ");
  const noteCount = contact.noteCount ?? 0;
  const apptIndicator = pickApptIndicator(contact);
  const stageIndicator = stageView ? renderStageIndicator(stageView) : null;

  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          "flex w-full flex-col gap-1 px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/30",
          isActive && "bg-muted"
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {displayName(contact)}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {noteCount > 0 && (
              <Badge
                variant="outline"
                className="gap-1 px-1.5 text-[10px] tabular-nums"
                title={`${noteCount} note${noteCount === 1 ? "" : "s"}`}
              >
                <StickyNote className="text-amber-500" />
                {noteCount}
              </Badge>
            )}
          </div>
        </div>
        {subtitle && (
          <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
        )}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {apptIndicator && (
            <Badge variant="outline" className="gap-1 px-1.5 text-[10px]">
              {apptIndicator.kind === "upcoming" ? (
                <CalendarClock className="text-emerald-500" />
              ) : (
                <CalendarCheck2 className="text-muted-foreground" />
              )}
              {apptIndicator.label}
            </Badge>
          )}
          {stageIndicator}
          {contact.tags.slice(0, 2).map((t) => (
            <Badge key={t} variant="secondary" className="max-w-[8rem] text-[10px] py-0 px-1.5">
              <span className="truncate">{t}</span>
            </Badge>
          ))}
          {contact.tags.length > 2 && (
            <span className="text-[10px] text-muted-foreground">+{contact.tags.length - 2}</span>
          )}
        </div>
      </button>
    </li>
  );
});

function pickApptIndicator(c: GhlContact): { kind: "upcoming" | "past"; label: string } | null {
  if (c.nextAppointmentTime) {
    return { kind: "upcoming", label: shortDate(c.nextAppointmentTime) };
  }
  if (c.lastAppointmentTime) {
    return { kind: "past", label: shortDate(c.lastAppointmentTime) };
  }
  return null;
}

/**
 * Pure resolver: turns a contact's most-recent opportunity + the pipeline
 * catalog into the primitives the row needs (label / status / pipeline
 * name). Computed once per contacts-or-pipelines change in the parent so
 * the heavy memoized `ContactRow` doesn't see the volatile pipelines
 * array directly.
 */
function computeStageView(c: GhlContact, pipelines: GhlPipeline[]): StageView | null {
  const opps = c.opportunities ?? [];
  if (opps.length === 0) return null;
  let top = opps[0];
  let topMs = time(top.updatedAt);
  for (let i = 1; i < opps.length; i++) {
    const t = time(opps[i].updatedAt);
    if (t > topMs) {
      topMs = t;
      top = opps[i];
    }
  }
  const p = pipelines.find((p) => p.id === top.pipelineId);
  const stage = p?.stages.find((s) => s.id === top.pipelineStageId);
  const label = stage?.name ?? "Open";
  const rawStatus = (top.status ?? "open").toLowerCase();
  const status: StageView["status"] =
    rawStatus === "won" || rawStatus === "lost" || rawStatus === "abandoned"
      ? rawStatus
      : "open";
  return { label, status, pipelineName: p?.name ?? "" };
}

function renderStageIndicator(view: StageView): React.ReactNode {
  const tone: BadgeTone =
    view.status === "won"
      ? "success"
      : view.status === "lost"
      ? "danger"
      : view.status === "abandoned"
      ? "neutral"
      : "info";
  return (
    <Badge
      variant="outline"
      tone={tone}
      className="gap-1.5 px-1.5 text-[10px]"
      title={view.pipelineName ? `${view.pipelineName} · ${view.label}` : view.label}
    >
      <BadgeDot tone={tone} />
      <span className="truncate max-w-[8rem]">{view.label}</span>
    </Badge>
  );
}

function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

// ── States ────────────────────────────────────────────────────────────

function ListSkeleton() {
  return (
    <ul className="divide-y">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <li key={i} className="space-y-2 px-3 py-2.5">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </li>
      ))}
    </ul>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-start gap-2 p-6 text-sm">
      <div className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="size-4" />
        <span className="font-medium">Couldn’t load contacts</span>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">{message}</p>
    </div>
  );
}
