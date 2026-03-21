"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function AdminPagination({ currentPage, totalPages, onPageChange }: AdminPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-1">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors",
          currentPage <= 1 ? "opacity-40 cursor-not-allowed" : "hover:bg-accent hover:text-foreground"
        )}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
        <button
          key={page}
          onClick={() => onPageChange(page)}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition-colors",
            page === currentPage
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          {page}
        </button>
      ))}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors",
          currentPage >= totalPages ? "opacity-40 cursor-not-allowed" : "hover:bg-accent hover:text-foreground"
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
