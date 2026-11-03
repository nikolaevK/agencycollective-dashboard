"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

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
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search admins..."
          aria-label="Search admins"
          className="pl-9"
        />
      </div>
      {/* Plain aria-pressed pills (no Radix ToggleGroup — three buttons don't
          need roving focus in the page chunk). Clicking the active pill
          re-applies it, like the old pills. */}
      <div role="group" aria-label="Filter admins" className="flex w-fit items-center gap-1">
        {filters.map((f) => {
          const active = filter === f.value;
          return (
            <button
              key={f.value}
              type="button"
              aria-pressed={active}
              onClick={() => onFilterChange(f.value)}
              className={cn(
                "inline-flex h-8 items-center justify-center whitespace-nowrap rounded-3xl border border-input px-3 text-sm font-medium outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30",
                active ? "bg-muted" : "bg-transparent"
              )}
            >
              {f.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
