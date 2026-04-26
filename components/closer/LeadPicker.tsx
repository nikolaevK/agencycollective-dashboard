"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

/**
 * subLabel comes from the backend as raw text (ISO datetime, YYYY-MM-DD, or
 * a free-form status summary). Attempt to prettify date-looking strings;
 * fall through to the original for anything else.
 */
function prettifySubLabel(raw: string | null): string | null {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-").map(Number);
    try {
      return format(new Date(y, m - 1, d), "MMM d, yyyy");
    } catch {
      return raw;
    }
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    try {
      return format(parseISO(raw), "MMM d, yyyy · h:mm a");
    } catch {
      return raw;
    }
  }
  return raw;
}

export interface NoteLead {
  label: string;
  subLabel: string | null;
  googleEventId: string | null;
  dealId: string | null;
  clientEmail: string | null;
  kind: "appointment" | "deal" | "no_show" | "showed";
}

interface Selected {
  googleEventId: string | null;
  dealId: string | null;
  label: string;
  kind: NoteLead["kind"];
}

interface Props {
  value: Selected | null;
  onChange: (selected: Selected | null) => void;
}

const KIND_LABEL: Record<NoteLead["kind"], string> = {
  appointment: "Appointment",
  deal: "Deal",
  no_show: "No-show",
  showed: "Showed",
};

const KIND_BADGE: Record<NoteLead["kind"], string> = {
  appointment: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  deal: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  no_show: "bg-red-500/15 text-red-700 dark:text-red-400",
  showed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
};

function leadKey(lead: Pick<NoteLead, "googleEventId" | "dealId">): string {
  return `${lead.googleEventId ?? ""}|${lead.dealId ?? ""}`;
}

function selectedKey(sel: Selected | null): string | null {
  if (!sel) return null;
  return `${sel.googleEventId ?? ""}|${sel.dealId ?? ""}`;
}

type KindFilter = "all" | NoteLead["kind"];

// Order chips by the natural pipeline stage: prep → close → outcome.
const KIND_FILTER_ORDER: NoteLead["kind"][] = ["appointment", "deal", "showed", "no_show"];

export function LeadPicker({ value, onChange }: Props) {
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [page, setPage] = useState(0);

  // Reset to first page when search or kind filter changes — otherwise the
  // user can land on an empty page after narrowing the set.
  useEffect(() => {
    setPage(0);
  }, [search, kindFilter]);

  const { data: leads = [], isLoading } = useQuery<NoteLead[]>({
    queryKey: ["note-leads"],
    queryFn: async () => {
      const res = await fetch("/api/closer/notes/leads");
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 60_000,
  });

  // Per-kind counts drive both chip badges and which chips render at all
  // (kinds with zero items stay hidden so closers don't see an "Appointments"
  // chip they can never use).
  const counts = useMemo<Record<KindFilter, number>>(() => {
    const c: Record<KindFilter, number> = {
      all: leads.length,
      appointment: 0,
      deal: 0,
      no_show: 0,
      showed: 0,
    };
    for (const l of leads) c[l.kind]++;
    return c;
  }, [leads]);

  // Kind filter first, then text search, so the chip and the search field
  // compose: "deals containing 'acme'" reads cleanly.
  const matching = useMemo(() => {
    const byKind = kindFilter === "all" ? leads : leads.filter((l) => l.kind === kindFilter);
    const q = search.trim().toLowerCase();
    if (!q) return byKind;
    return byKind.filter((lead) => {
      const haystack = `${lead.label} ${lead.subLabel ?? ""} ${lead.clientEmail ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [leads, search, kindFilter]);

  const pageCount = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const filtered = useMemo(
    () => matching.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE),
    [matching, safePage]
  );

  const currentKey = selectedKey(value);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium text-foreground">Linked lead</label>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      {value && (
        <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{value.label}</p>
            <span className={cn("inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide", KIND_BADGE[value.kind])}>
              {KIND_LABEL[value.kind]}
            </span>
          </div>
          <Check className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search prospects, deals, showed, no-shows…"
          aria-label="Search leads"
          className="w-full h-10 pl-9 pr-3 rounded-lg border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div role="tablist" aria-label="Filter by lead kind" className="flex flex-wrap items-center gap-1">
        <FilterChip
          active={kindFilter === "all"}
          count={counts.all}
          onClick={() => setKindFilter("all")}
        >
          All
        </FilterChip>
        {KIND_FILTER_ORDER.map((k) =>
          counts[k] > 0 ? (
            <FilterChip
              key={k}
              active={kindFilter === k}
              count={counts[k]}
              kind={k}
              onClick={() => setKindFilter(k)}
            >
              {KIND_LABEL[k]}
            </FilterChip>
          ) : null
        )}
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>
          {matching.length === 0
            ? search || kindFilter !== "all" ? "No matches." : "No leads yet."
            : `${matching.length} ${search || kindFilter !== "all" ? "matching" : "total"} · page ${safePage + 1} of ${pageCount}`}
        </span>
        {pageCount > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="inline-flex items-center gap-0.5 h-7 px-2 rounded-md border border-border text-[11px] font-medium hover:bg-accent disabled:opacity-40 disabled:pointer-events-none"
            >
              <ChevronLeft className="h-3 w-3" />
              Prev
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              className="inline-flex items-center gap-0.5 h-7 px-2 rounded-md border border-border text-[11px] font-medium hover:bg-accent disabled:opacity-40 disabled:pointer-events-none"
            >
              Next
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      <div className="max-h-56 overflow-y-auto rounded-lg border border-border/50 divide-y divide-border/40">
        {isLoading ? (
          <div className="p-3 text-xs text-muted-foreground">Loading leads…</div>
        ) : filtered.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">
            {search || kindFilter !== "all"
              ? "No matches."
              : "No leads yet. Claim an appointment or close a deal first."}
          </div>
        ) : (
          filtered.map((lead) => {
            const key = leadKey(lead);
            const isSelected = currentKey === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() =>
                  onChange({
                    googleEventId: lead.googleEventId,
                    dealId: lead.dealId,
                    label: lead.label,
                    kind: lead.kind,
                  })
                }
                className={cn(
                  "w-full text-left px-3 py-2 hover:bg-accent transition-colors flex items-center justify-between gap-2",
                  isSelected && "bg-sky-500/5"
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn("inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide", KIND_BADGE[lead.kind])}>
                      {KIND_LABEL[lead.kind]}
                    </span>
                    <p className="text-sm text-foreground truncate">{lead.label}</p>
                  </div>
                  {lead.subLabel && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{prettifySubLabel(lead.subLabel)}</p>
                  )}
                </div>
                {isSelected && <Check className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

interface FilterChipProps {
  active: boolean;
  count: number;
  onClick: () => void;
  /** When set, the active state borrows the kind's badge color so the chip
   *  reads consistent with the row badge below. "All" omits this. */
  kind?: NoteLead["kind"];
  children: React.ReactNode;
}

function FilterChip({ active, count, onClick, kind, children }: FilterChipProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[11px] font-medium transition-colors",
        active
          ? kind
            ? KIND_BADGE[kind]
            : "bg-foreground/10 text-foreground"
          : "text-muted-foreground hover:bg-muted/40"
      )}
    >
      <span>{children}</span>
      <span className={cn("tabular-nums", active ? "opacity-80" : "opacity-60")}>{count}</span>
    </button>
  );
}
