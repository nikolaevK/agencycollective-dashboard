"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface PaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  /** Show first/last buttons. Useful when totalPages is large. */
  showFirstLast?: boolean;
  /** Optional label override for the count line. Defaults to "Showing X–Y of Z". */
  itemLabel?: string;
}

export function Pagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  showFirstLast = false,
  itemLabel,
}: PaginationProps) {
  if (totalItems <= pageSize) return null;

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  // Caller may pass a stale page after data shrank; clamp for both display
  // and the navigation handlers so prev/next move from the visible page.
  const safePage = Math.min(Math.max(1, page), totalPages);
  const firstItem = (safePage - 1) * pageSize + 1;
  const lastItem = Math.min(safePage * pageSize, totalItems);

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between mt-3 text-xs text-muted-foreground"
    >
      <span>
        {itemLabel ?? `Showing ${firstItem}–${lastItem} of ${totalItems}`}
      </span>
      <div className="flex items-center gap-1">
        {showFirstLast && (
          <button
            type="button"
            onClick={() => onPageChange(1)}
            disabled={safePage === 1}
            aria-label="First page"
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border/50 bg-background hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronsLeft className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          disabled={safePage === 1}
          aria-label="Previous page"
          className="inline-flex items-center gap-1 h-8 px-2 rounded-lg border border-border/50 bg-background hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Prev
        </button>
        <span className="px-2 tabular-nums" aria-current="page">
          {safePage} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
          disabled={safePage === totalPages}
          aria-label="Next page"
          className="inline-flex items-center gap-1 h-8 px-2 rounded-lg border border-border/50 bg-background hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        {showFirstLast && (
          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            disabled={safePage === totalPages}
            aria-label="Last page"
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border/50 bg-background hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronsRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </nav>
  );
}
