"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClientTeamMember, TeamRole } from "@/lib/clientProfile";
import { ChipPopover } from "./ChipPopover";
import { useMirroredSelection } from "./ChipMultiSelect";
import { CHIP_BASE } from "./rosterPresentation";

export interface TeamOption {
  id: string;
  name: string;
  avatarPath: string | null;
  isMediaBuyer: boolean;
}

/** Assignable people (admins) for the Lead / Media Buyer pickers. */
export function useTeamOptions() {
  return useQuery<TeamOption[]>({
    queryKey: ["client-team-options"],
    queryFn: async () => {
      const res = await fetch("/api/admin/clients/team-options");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json.data as TeamOption[];
    },
    staleTime: 300_000,
  });
}

const PERSON_CHIP_CLS = "bg-primary/10 text-primary";

/**
 * Roster people picker: assigned admins render as chips with an ×, the `+`
 * popover lists all admins. For the media_buyer role, media-perm admins sort
 * first with a small "Media" badge. onChange receives the full desired member
 * list for THIS role (replace-set semantics, matching PUT …/team).
 */
export function TeamPicker({
  role,
  members,
  onChange,
  disabled,
  compact,
}: {
  role: TeamRole;
  /** Current assignments for this role only. */
  members: ClientTeamMember[];
  onChange: (next: ClientTeamMember[]) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);
  const { data: options = [], isLoading } = useTeamOptions();
  // Fresh-selection mirror — see useMirroredSelection (rapid-toggle race).
  // Key includes names, not just ids: an admin rename must re-sync the chips
  // (same ids, new display names) or the old name sticks until membership changes.
  const [selected, setSelected] = useMirroredSelection(
    members,
    JSON.stringify(members.map((m) => [m.adminId, m.name]))
  );

  function emit(next: ClientTeamMember[]) {
    setSelected(next);
    onChange(next);
  }

  const sorted =
    role === "media_buyer"
      ? [...options].sort(
          (a, b) => Number(b.isMediaBuyer) - Number(a.isMediaBuyer) || a.name.localeCompare(b.name)
        )
      : [...options].sort((a, b) => a.name.localeCompare(b.name));

  function toggle(opt: TeamOption) {
    if (selected.some((m) => m.adminId === opt.id)) {
      emit(selected.filter((m) => m.adminId !== opt.id));
    } else {
      emit([
        ...selected,
        { adminId: opt.id, role, name: opt.name, avatarPath: opt.avatarPath },
      ]);
    }
  }

  return (
    <div
      className={cn("flex flex-wrap items-center", compact ? "gap-1" : "gap-1.5")}
      onClick={(e) => e.stopPropagation()}
    >
      {selected.map((m) => (
        <span key={m.adminId} className={cn(CHIP_BASE, PERSON_CHIP_CLS)}>
          {m.name}
          {!disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                emit(selected.filter((x) => x.adminId !== m.adminId));
              }}
              className="opacity-50 hover:opacity-100 transition-opacity"
              aria-label={`Remove ${m.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <button
          ref={addRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          className="inline-flex items-center justify-center h-5 w-5 rounded-full border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          aria-label={role === "media_buyer" ? "Assign media buyer" : "Assign lead"}
        >
          <Plus className="h-3 w-3" />
        </button>
      )}
      {open && addRef.current && (
        <ChipPopover anchor={addRef.current} onClose={() => setOpen(false)}>
          {isLoading && (
            <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>
          )}
          {!isLoading && sorted.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No admins found</p>
          )}
          {sorted.map((opt) => {
            const checked = selected.some((m) => m.adminId === opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => toggle(opt)}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-accent transition-colors"
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                    checked ? "bg-primary border-primary" : "border-input bg-background"
                  )}
                >
                  {checked && <Check className="h-3 w-3 text-primary-foreground" />}
                </span>
                <span className={cn("text-left flex-1 truncate", checked && "font-semibold")}>
                  {opt.name}
                </span>
                {opt.isMediaBuyer && (
                  <span className="shrink-0 px-1.5 py-0 rounded text-[9px] font-bold uppercase bg-sky-500/10 text-sky-600 dark:text-sky-400">
                    Media
                  </span>
                )}
              </button>
            );
          })}
        </ChipPopover>
      )}
    </div>
  );
}
