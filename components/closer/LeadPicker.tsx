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
  kind: "appointment" | "deal" | "no_show";
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
};

const KIND_BADGE: Record<NoteLead["kind"], string> = {
  appointment: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  deal: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  no_show: "bg-red-500/15 text-red-700 dark:text-red-400",
};

function leadKey(lead: Pick<NoteLead, "googleEventId" | "dealId">): string {
  return `${lead.googleEventId ?? ""}|${lead.dealId ?? ""}`;
}

function selectedKey(sel: Selected | null): string | null {
  if (!sel) return null;
  return `${sel.googleEventId ?? ""}|${sel.dealId ?? ""}`;
}

export function LeadPicker({ value, onChange }: Props) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  // Reset to page 1 whenever the search input changes so the user doesn't
  // land on an empty page after typing.
  useEffect(() => {
    setPage(0);
  }, [search]);

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

  // Search first, then paginate so "Page X of Y" matches the filtered set.
  const matching = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((lead) => {
      const haystack = `${lead.label} ${lead.subLabel ?? ""} ${lead.clientEmail ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [leads, search]);

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
          placeholder="Search prospects, deals, no-shows…"
          className="w-full h-10 pl-9 pr-3 rounded-lg border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>
          {matching.length === 0
            ? search ? "No matches." : "No leads yet."
            : `${matching.length} total${search ? " matching" : ""} · page ${safePage + 1} of ${pageCount}`}
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
            {search ? "No matches." : "No leads yet. Claim an appointment or close a deal first."}
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
