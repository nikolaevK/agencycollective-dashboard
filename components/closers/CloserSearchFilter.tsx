"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

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
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search closers..."
          className="pl-9"
        />
      </div>

      {/* Filter Pills — Radix sends "" when the active pill is clicked again;
          the old pills re-applied the current filter then, so do the same. */}
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={filter}
        onValueChange={(v) => setFilter((v || filter) as "all" | "active" | "inactive")}
      >
        {FILTERS.map((f) => (
          <ToggleGroupItem key={f.value} value={f.value} className="px-3">
            {f.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
