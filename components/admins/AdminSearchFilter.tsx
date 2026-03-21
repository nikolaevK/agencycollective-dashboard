"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type AdminFilter = "all" | "super" | "standard";

interface AdminSearchFilterProps {
  search: string;
  onSearchChange: (value: string) => void;
  filter: AdminFilter;
  onFilterChange: (filter: AdminFilter) => void;
}

const filters: { value: AdminFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "super", label: "Super Admins" },
  { value: "standard", label: "Standard" },
];

export function AdminSearchFilter({ search, onSearchChange, filter, onFilterChange }: AdminSearchFilterProps) {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search admins..."
          className="flex h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
        />
      </div>
      <div className="flex items-center gap-1">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => onFilterChange(f.value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              filter === f.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
