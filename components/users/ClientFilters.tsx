"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORIES } from "./types";
import { DateRangeDropdown, type DateRangeValue } from "./DateRangeDropdown";
import type { UserStatus } from "@/lib/users";
import type { RebillStatus } from "@/lib/clientBilling";
import type { ClientBook } from "@/lib/clientProfile";
import type { TeamFilterSelection } from "./TeamFilterCards";

export type RebillFilter = "all" | RebillStatus;

export interface ClientFilterState {
  search: string;
  status: "all" | UserStatus;
  category: string; // "" = all
  rebill: RebillFilter;
  mrrMin: string; // dollars (text)
  mrrMax: string;
  joined: DateRangeValue;
  lastRebill: DateRangeValue;
  // Roster filters (toggled from the RosterDashboard pills + person cards)
  book: "all" | ClientBook;
  stages: string[]; // any-match
  health: string[];
  services: string[];
  platforms: string[];
  team: TeamFilterSelection | null; // person filter cards
}

export const DEFAULT_FILTERS: ClientFilterState = {
  search: "",
  status: "all",
  category: "",
  rebill: "all",
  mrrMin: "",
  mrrMax: "",
  joined: { from: "", to: "" },
  lastRebill: { from: "", to: "" },
  book: "all",
  stages: [],
  health: [],
  services: [],
  platforms: [],
  team: null,
};

export function filtersActive(f: ClientFilterState): boolean {
  return (
    f.search.trim() !== "" ||
    f.status !== "all" ||
    f.category !== "" ||
    f.rebill !== "all" ||
    f.mrrMin !== "" ||
    f.mrrMax !== "" ||
    Boolean(f.joined.from || f.joined.to) ||
    Boolean(f.lastRebill.from || f.lastRebill.to) ||
    f.book !== "all" ||
    f.stages.length > 0 ||
    f.health.length > 0 ||
    f.services.length > 0 ||
    f.platforms.length > 0 ||
    f.team !== null
  );
}

const SELECT_CLS =
  "rounded-md border bg-background px-3 py-2 text-sm font-medium shadow-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20";

export function ClientFilters({
  value,
  onChange,
}: {
  value: ClientFilterState;
  onChange: (next: ClientFilterState) => void;
}) {
  const set = <K extends keyof ClientFilterState>(
    key: K,
    v: ClientFilterState[K]
  ) => onChange({ ...value, [key]: v });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={value.search}
            onChange={(e) => set("search", e.target.value)}
            placeholder="Search name, email, brand, category…"
            className="w-full pl-9 pr-4 py-2 bg-background border rounded-md text-sm text-foreground placeholder:text-muted-foreground shadow-sm focus:ring-2 focus:ring-primary/20 focus:outline-none"
          />
        </div>

        {/* Status */}
        <select
          value={value.status}
          onChange={(e) => set("status", e.target.value as ClientFilterState["status"])}
          className={SELECT_CLS}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="onboarding">Onboarding</option>
          <option value="inactive">Inactive</option>
          <option value="archived">Archived</option>
        </select>

        {/* Book */}
        <select
          value={value.book}
          onChange={(e) => set("book", e.target.value as ClientFilterState["book"])}
          className={SELECT_CLS}
        >
          <option value="all">All books</option>
          <option value="agency">Agency Collective</option>
          <option value="pepads">PepAds</option>
        </select>

        {/* Re-bill status */}
        <select
          value={value.rebill}
          onChange={(e) => set("rebill", e.target.value as RebillFilter)}
          className={SELECT_CLS}
        >
          <option value="all">All re-bill</option>
          <option value="overdue">Overdue</option>
          <option value="due">Due soon</option>
          <option value="invoice_sent">Invoice sent</option>
          <option value="upcoming">Upcoming</option>
          <option value="extended">Extended</option>
          <option value="paused">Paused</option>
          <option value="unscheduled">Unscheduled</option>
        </select>

        {/* Category */}
        <select
          value={value.category}
          onChange={(e) => set("category", e.target.value)}
          className={SELECT_CLS}
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {/* Date joined */}
        <DateRangeDropdown
          label="Date joined"
          value={value.joined}
          onChange={(v) => set("joined", v)}
        />

        {/* Last re-bill */}
        <DateRangeDropdown
          label="Last re-bill"
          value={value.lastRebill}
          onChange={(v) => set("lastRebill", v)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* MRR range */}
        <div className="flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 shadow-sm">
          <span className="text-xs font-medium text-muted-foreground">MRR $</span>
          <input
            type="number"
            min={0}
            value={value.mrrMin}
            onChange={(e) => set("mrrMin", e.target.value)}
            placeholder="min"
            className="w-16 bg-transparent text-sm text-foreground focus:outline-none"
          />
          <span className="text-muted-foreground">–</span>
          <input
            type="number"
            min={0}
            value={value.mrrMax}
            onChange={(e) => set("mrrMax", e.target.value)}
            placeholder="max"
            className="w-16 bg-transparent text-sm text-foreground focus:outline-none"
          />
        </div>

        {filtersActive(value) && (
          <button
            type="button"
            onClick={() => onChange(DEFAULT_FILTERS)}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium shadow-sm",
              "text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            )}
          >
            <X className="h-3.5 w-3.5" />
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
