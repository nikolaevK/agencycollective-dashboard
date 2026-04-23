"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Search, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ShareTarget {
  id: string;
  displayName: string;
  role: string;
}

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
}

const ROLE_BADGE: Record<string, string> = {
  setter: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  senior_closer: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  account_executive: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  inbound_specialist: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400",
  closer: "bg-slate-500/15 text-slate-700 dark:text-slate-400",
};

const ROLE_LABEL: Record<string, string> = {
  setter: "Setter",
  senior_closer: "Senior closer",
  account_executive: "Account exec",
  inbound_specialist: "Inbound",
  closer: "Closer",
};

export function SharePicker({ value, onChange }: Props) {
  const [search, setSearch] = useState("");

  const { data: targets = [], isLoading } = useQuery<ShareTarget[]>({
    queryKey: ["note-share-targets"],
    queryFn: async () => {
      const res = await fetch("/api/closer/notes/share-targets");
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 120_000,
  });

  const selectedIds = useMemo(() => new Set(value), [value]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return targets;
    return targets.filter((t) => {
      const haystack = `${t.displayName} ${ROLE_LABEL[t.role] ?? t.role}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [targets, search]);

  const selectedTargets = useMemo(
    () => targets.filter((t) => selectedIds.has(t.id)),
    [targets, selectedIds]
  );

  function toggle(id: string) {
    if (selectedIds.has(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium text-foreground inline-flex items-center gap-1.5">
          <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
          Share with
        </label>
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      {selectedTargets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedTargets.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-sky-500/10 text-sky-700 dark:text-sky-400"
            >
              {t.displayName}
              <button
                type="button"
                onClick={() => toggle(t.id)}
                className="ml-0.5 text-sky-700/70 hover:text-sky-900 dark:text-sky-400/70 dark:hover:text-sky-300"
                aria-label={`Remove ${t.displayName}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search teammates…"
          className="w-full h-10 pl-9 pr-3 rounded-lg border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="max-h-48 overflow-y-auto rounded-lg border border-border/50 divide-y divide-border/40">
        {isLoading ? (
          <div className="p-3 text-xs text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">
            {search ? "No matches." : "No teammates yet."}
          </div>
        ) : (
          filtered.map((t) => {
            const selected = selectedIds.has(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggle(t.id)}
                className={cn(
                  "w-full text-left px-3 py-2 hover:bg-accent transition-colors flex items-center justify-between gap-2",
                  selected && "bg-sky-500/5"
                )}
              >
                <div className="min-w-0 flex-1 flex items-center gap-2">
                  <span className="text-sm text-foreground truncate">{t.displayName}</span>
                  <span className={cn(
                    "inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide",
                    ROLE_BADGE[t.role] ?? ROLE_BADGE.closer
                  )}>
                    {ROLE_LABEL[t.role] ?? t.role}
                  </span>
                </div>
                {selected && <Check className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
