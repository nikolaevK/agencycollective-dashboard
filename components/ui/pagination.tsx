"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";

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
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(1)}
            disabled={safePage === 1}
            aria-label="First page"
          >
            <ChevronsLeft />
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          disabled={safePage === 1}
          aria-label="Previous page"
        >
          <ChevronLeft />
          Prev
        </Button>
        <span className="px-2 tabular-nums" aria-current="page">
          {safePage} / {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
          disabled={safePage === totalPages}
          aria-label="Next page"
        >
          Next
          <ChevronRight />
        </Button>
        {showFirstLast && (
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(totalPages)}
            disabled={safePage === totalPages}
            aria-label="Last page"
          >
            <ChevronsRight />
          </Button>
        )}
      </div>
    </nav>
  );
}
