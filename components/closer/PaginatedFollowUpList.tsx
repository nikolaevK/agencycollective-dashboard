"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { NoShowFollowUpList, type NoShowFollowUpListProps } from "./NoShowFollowUpList";
import { Pagination } from "@/components/ui/pagination";
import type { NoShowFollowUp } from "@/lib/eventAttendance";

interface Props extends NoShowFollowUpListProps {
  /** Cards per page. Defaults to 10. */
  pageSize?: number;
  /**
   * Threshold above which First/Last navigation buttons appear. Below this,
   * Prev/Next is enough. Defaults to 10 pages.
   */
  firstLastAt?: number;
}

interface SortOption {
  value: string;
  label: string;
  field: "marked" | "scheduled";
  dir: "asc" | "desc";
}

// Decoupled from the option string so adding a sort doesn't touch parsing.
const SORT_OPTIONS: SortOption[] = [
  { value: "marked-desc", label: "Marked: newest", field: "marked", dir: "desc" },
  { value: "marked-asc", label: "Marked: oldest", field: "marked", dir: "asc" },
  { value: "scheduled-desc", label: "Scheduled: newest", field: "scheduled", dir: "desc" },
  { value: "scheduled-asc", label: "Scheduled: oldest", field: "scheduled", dir: "asc" },
];

function searchableText(n: NoShowFollowUp): string {
  const parts: (string | null)[] = [
    n.clientName,
    n.clientEmail,
    n.eventTitle,
    n.eventDescription,
    n.eventLocation,
    n.setterName,
    ...n.attendees.flatMap((a) => [a.email, a.displayName]),
  ];
  return parts.filter((v): v is string => Boolean(v)).join(" ").toLowerCase();
}

// markedAt (SQLite "YYYY-MM-DD HH:MM:SS") and scheduledAt (DB or ISO 8601
// from Google) can mix formats — Date.parse normalizes both to a numeric
// timestamp so chronological sort is exact, not lexicographic-approximate.
function dateMs(s: string | null | undefined): number {
  if (!s) return 0;
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

function sortKey(n: NoShowFollowUp, field: "marked" | "scheduled"): number {
  if (field === "scheduled") return dateMs(n.scheduledAt) || dateMs(n.markedAt);
  return dateMs(n.markedAt);
}

export function PaginatedFollowUpList({
  items,
  variant,
  tone = "active",
  onEdit,
  emptyText,
  pageSize = 10,
  firstLastAt = 10,
}: Props) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>(SORT_OPTIONS[0]);
  const [page, setPage] = useState(1);

  // Reset to page 1 only when the user changes search/sort. Refetches that
  // change `items` are absorbed by Pagination's internal clamp — kicking the
  // user back to page 1 mid-read on every 2-min refetch is jarring.
  useEffect(() => {
    setPage(1);
  }, [search, sort]);

  const processed = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? items.filter((n) => searchableText(n).includes(q)) : items;
    return [...filtered].sort((a, b) => {
      const av = sortKey(a, sort.field);
      const bv = sortKey(b, sort.field);
      return sort.dir === "desc" ? bv - av : av - bv;
    });
  }, [items, search, sort]);

  const totalPages = Math.max(1, Math.ceil(processed.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = processed.slice((safePage - 1) * pageSize, safePage * pageSize);

  // Distinguish "list is empty" (use caller's emptyText) from "search hid
  // everything" (more useful to tell the user *why* it's blank).
  const resolvedEmpty =
    search && items.length > 0 ? `No results matching "${search}".` : emptyText;

  // Filtered-vs-total label so the count never silently disagrees with what
  // the user is actually looking at.
  const countLabel =
    search && processed.length !== items.length
      ? `${processed.length} of ${items.length} matching`
      : `${items.length} ${items.length === 1 ? "item" : "items"}`;

  return (
    <div>
      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, or title…"
              aria-label="Search follow-ups"
              className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
          </div>
          <select
            value={sort.value}
            onChange={(e) =>
              setSort(SORT_OPTIONS.find((o) => o.value === e.target.value) ?? SORT_OPTIONS[0])
            }
            aria-label="Sort order"
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
            {countLabel}
          </span>
        </div>
      )}

      <NoShowFollowUpList
        items={pageItems}
        variant={variant}
        tone={tone}
        onEdit={onEdit}
        emptyText={resolvedEmpty}
      />

      <Pagination
        page={safePage}
        pageSize={pageSize}
        totalItems={processed.length}
        onPageChange={setPage}
        showFirstLast={totalPages >= firstLastAt}
      />
    </div>
  );
}
