"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Search, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ShareTarget {
  id: string;
  displayName: string;
  role: string;
}

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
}

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
        <label className="text-sm font-medium inline-flex items-center gap-1.5">
          <UserPlus className="size-3.5 text-muted-foreground" />
          Share with
        </label>
        {value.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => onChange([])}
            className="text-muted-foreground"
          >
            <X />
            Clear
          </Button>
        )}
      </div>

      {selectedTargets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedTargets.map((t) => (
            <Badge key={t.id} variant="secondary" className="max-w-full">
              <span className="truncate">{t.displayName}</span>
              <button
                type="button"
                onClick={() => toggle(t.id)}
                className="ml-0.5 text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${t.displayName}`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search teammates…"
          className="pl-9"
        />
      </div>

      <div className="max-h-48 overflow-y-auto overscroll-contain rounded-2xl border divide-y">
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
                  "w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors flex items-center justify-between gap-2",
                  selected && "bg-muted/60"
                )}
              >
                <div className="min-w-0 flex-1 flex items-center gap-2">
                  <span className="text-sm text-foreground truncate">{t.displayName}</span>
                  <span className={cn(badgeVariants({ variant: "outline" }), "h-4 px-1.5 text-[10px] text-muted-foreground")}>
                    {ROLE_LABEL[t.role] ?? t.role}
                  </span>
                </div>
                {selected && <Check className="size-4 text-foreground shrink-0" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
