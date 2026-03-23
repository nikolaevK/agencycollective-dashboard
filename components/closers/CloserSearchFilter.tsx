"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface CloserSearchFilterProps {
  search: string;
  setSearch: (value: string) => void;
  filter: "all" | "active" | "inactive";
  setFilter: (value: "all" | "active" | "inactive") => void;
}

const FILTERS: { value: "all" | "active" | "inactive"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

export function CloserSearchFilter({
  search,
  setSearch,
  filter,
  setFilter,
}: CloserSearchFilterProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
      {/* Search Input */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search closers..."
          className="flex h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
        />
      </div>

      {/* Filter Pills */}
      <div className="flex gap-1 rounded-lg bg-muted/50 dark:bg-white/5 p-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors",
              filter === f.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
