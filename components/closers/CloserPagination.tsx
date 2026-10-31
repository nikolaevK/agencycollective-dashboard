"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CloserPaginationProps {
  page: number;
  setPage: (page: number) => void;
  total: number;
  perPage: number;
}

export function CloserPagination({
  page,
  setPage,
  total,
  perPage,
}: CloserPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = total === 0 ? 0 : (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, total);

  if (total <= perPage) return null;

  // Build page numbers to display
  function getPageNumbers(): (number | "ellipsis")[] {
    const pages: (number | "ellipsis")[] = [];

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }

    pages.push(1);

    if (page > 3) {
      pages.push("ellipsis");
    }

    const rangeStart = Math.max(2, page - 1);
    const rangeEnd = Math.min(totalPages - 1, page + 1);

    for (let i = rangeStart; i <= rangeEnd; i++) {
      pages.push(i);
    }

    if (page < totalPages - 2) {
      pages.push("ellipsis");
    }

    pages.push(totalPages);

    return pages;
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6">
      <p className="text-sm text-muted-foreground">
        Showing{" "}
        <span className="font-medium text-foreground tabular-nums">
          {start}-{end}
        </span>{" "}
        of <span className="font-medium text-foreground tabular-nums">{total}</span> closers
      </p>

      <div className="flex flex-wrap items-center justify-center gap-1">
        {/* Previous */}
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => setPage(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft />
        </Button>

        {/* Page Numbers */}
        {getPageNumbers().map((p, i) =>
          p === "ellipsis" ? (
            <span
              key={`ellipsis-${i}`}
              className="flex size-8 items-center justify-center text-sm text-muted-foreground"
            >
              ...
            </span>
          ) : (
            <Button
              key={p}
              variant={page === p ? "default" : "ghost"}
              size="icon-sm"
              onClick={() => setPage(p)}
              aria-current={page === p ? "page" : undefined}
              className="tabular-nums"
            >
              {p}
            </Button>
          )
        )}

        {/* Next */}
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => setPage(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
