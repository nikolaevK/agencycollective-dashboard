"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

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
      {/* Radix sends "" when the active pill is clicked again — the old pills
          re-applied the current filter then, so do the same. */}
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={filter}
        onValueChange={(v) => onFilterChange((v || filter) as AdminFilter)}
      >
        {filters.map((f) => (
          <ToggleGroupItem key={f.value} value={f.value} className="px-3">
            {f.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
