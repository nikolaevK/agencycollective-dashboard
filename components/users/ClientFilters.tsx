"use client";

import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORIES } from "./types";
import { DateRangeDropdown, type DateRangeValue } from "./DateRangeDropdown";
import type { UserStatus } from "@/lib/users";
import type { RebillStatus } from "@/lib/clientBilling";
import type { ClientBook } from "@/lib/clientProfile";
import type { TeamFilterSelection } from "./TeamFilterCards";
import { useWorkspaces } from "@/hooks/useWorkspaces";

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
  workspace: string; // "all" = every visible workspace (book scope)
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
  workspace: "all",
  stages: [],
  health: [],
  services: [],
  platforms: [],
  team: null,
};

export function filtersActive(f: ClientFilterState): boolean {
  return (
    f.workspace !== "all" ||
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

// Radix SelectItem can't hold "" — the "All categories" option maps to it.
const ALL_CATEGORIES = "__all__";

const SELECT_TRIGGER_CLS = "w-auto min-w-[9rem]";

export function ClientFilters({
  value,
  onChange,
}: {
  value: ClientFilterState;
  onChange: (next: ClientFilterState) => void;
}) {
  const { workspaces } = useWorkspaces();
  const set = <K extends keyof ClientFilterState>(
    key: K,
    v: ClientFilterState[K]
  ) => onChange({ ...value, [key]: v });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={value.search}
            onChange={(e) => set("search", e.target.value)}
            placeholder="Search name, email, brand, category…"
            aria-label="Search clients"
            className="pl-9"
          />
        </div>

        {/* Status */}
        <Select
          value={value.status}
          onValueChange={(v) => set("status", v as ClientFilterState["status"])}
        >
          <SelectTrigger className={SELECT_TRIGGER_CLS} aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="onboarding">Onboarding</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>

        {/* Workspace (separate directories for outside teams) */}
        {workspaces.length > 1 && (
          <Select value={value.workspace} onValueChange={(v) => set("workspace", v)}>
            <SelectTrigger className={SELECT_TRIGGER_CLS} aria-label="Workspace">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All workspaces</SelectItem>
              {workspaces.map((w) => (
                <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Book */}
        <Select
          value={value.book}
          onValueChange={(v) => set("book", v as ClientFilterState["book"])}
        >
          <SelectTrigger className={SELECT_TRIGGER_CLS} aria-label="Book">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All books</SelectItem>
            <SelectItem value="agency">Agency Collective</SelectItem>
            <SelectItem value="pepads">PepAds</SelectItem>
          </SelectContent>
        </Select>

        {/* Re-bill status */}
        <Select value={value.rebill} onValueChange={(v) => set("rebill", v as RebillFilter)}>
          <SelectTrigger className={SELECT_TRIGGER_CLS} aria-label="Re-bill status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All re-bill</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="due">Due soon</SelectItem>
            <SelectItem value="invoice_sent">Invoice sent</SelectItem>
            <SelectItem value="upcoming">Upcoming</SelectItem>
            <SelectItem value="extended">Extended</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="unscheduled">Unscheduled</SelectItem>
          </SelectContent>
        </Select>

        {/* Category */}
        <Select
          value={value.category || ALL_CATEGORIES}
          onValueChange={(v) => set("category", v === ALL_CATEGORIES ? "" : v)}
        >
          <SelectTrigger className={SELECT_TRIGGER_CLS} aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
        <div className="flex h-9 items-center gap-1.5 rounded-3xl border border-transparent bg-input/50 px-3 transition-[box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
          <span className="text-xs text-muted-foreground">MRR $</span>
          <input
            type="number"
            min={0}
            value={value.mrrMin}
            onChange={(e) => set("mrrMin", e.target.value)}
            placeholder="min"
            aria-label="Minimum MRR"
            className="w-16 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <span className="text-muted-foreground">–</span>
          <input
            type="number"
            min={0}
            value={value.mrrMax}
            onChange={(e) => set("mrrMax", e.target.value)}
            placeholder="max"
            aria-label="Maximum MRR"
            className="w-16 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>

        {filtersActive(value) && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => onChange(DEFAULT_FILTERS)}
            className="text-muted-foreground"
          >
            <X />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
