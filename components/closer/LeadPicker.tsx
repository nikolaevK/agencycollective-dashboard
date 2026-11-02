"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { BadgeDot, StatusBadge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

/** Status tone per lead kind (Badge pattern). */
const KIND_TONE: Record<NoteLead["kind"], BadgeTone> = {
  appointment: "info",
  deal: "neutral",
  no_show: "danger",
  showed: "success",
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
        <label className="text-sm font-medium">Linked lead</label>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => onChange(null)}
            className="text-muted-foreground"
          >
            <X />
            Clear
          </Button>
        )}
      </div>

      {value && (
        <div className="rounded-2xl bg-muted/50 px-3 py-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{value.label}</p>
            <StatusBadge tone={KIND_TONE[value.kind]} className="mt-1">
              {KIND_LABEL[value.kind]}
            </StatusBadge>
          </div>
          <Check className="size-4 text-foreground shrink-0" />
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search prospects, deals, showed, no-shows…"
          aria-label="Search leads"
          className="pl-9"
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

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {matching.length === 0
            ? search || kindFilter !== "all" ? "No matches." : "No leads yet."
            : `${matching.length} ${search || kindFilter !== "all" ? "matching" : "total"} · page ${safePage + 1} of ${pageCount}`}
        </span>
        {pageCount > 1 && (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
            >
              <ChevronLeft />
              Prev
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
            >
              Next
              <ChevronRight />
            </Button>
          </div>
        )}
      </div>

      <div className="max-h-56 overflow-y-auto overscroll-contain rounded-2xl border divide-y">
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
                  "w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors flex items-center justify-between gap-2",
                  isSelected && "bg-muted/60"
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <StatusBadge tone={KIND_TONE[lead.kind]}>
                      {KIND_LABEL[lead.kind]}
                    </StatusBadge>
                    <p className="min-w-0 text-sm text-foreground truncate">{lead.label}</p>
                  </div>
                  {lead.subLabel && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{prettifySubLabel(lead.subLabel)}</p>
                  )}
                </div>
                {isSelected && <Check className="size-4 text-foreground shrink-0" />}
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
  /** When set, the chip carries the kind's status dot so it reads
   *  consistent with the row badge below. "All" omits this. */
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
        "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-3xl text-xs font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
    >
      {kind && <BadgeDot tone={KIND_TONE[kind]} />}
      <span>{children}</span>
      <span className={cn("tabular-nums", active ? "opacity-80" : "opacity-60")}>{count}</span>
    </button>
  );
}
