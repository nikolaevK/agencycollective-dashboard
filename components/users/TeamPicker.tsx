"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClientTeamMember, TeamRole } from "@/lib/clientProfile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChipPopover } from "./ChipPopover";
import { useMirroredSelection } from "./ChipMultiSelect";

export interface TeamOption {
  id: string;
  name: string;
  avatarPath: string | null;
  isMediaBuyer: boolean;
  /** admins.role === 'csm' — its own role, never merged with Media Buyer. */
  isCsm: boolean;
}

/** Assignable people (admins) for the Lead / Media Buyer / CSM pickers. */
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

/**
 * Roster people picker: assigned admins render as badges with an ×, the `+`
 * popover lists all admins. For the media_buyer role, media-perm admins sort
 * first with a small "Media" badge; for the csm role, CSM-role admins sort
 * first with a "CSM" badge (parallel but never mixed). onChange receives the
 * full desired member list for THIS role (replace-set semantics, matching
 * PUT …/team).
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
      : role === "csm"
        ? [...options].sort(
            (a, b) => Number(b.isCsm) - Number(a.isCsm) || a.name.localeCompare(b.name)
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
        <Badge key={m.adminId} variant="secondary" className="gap-1">
          {m.name}
          {!disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                emit(selected.filter((x) => x.adminId !== m.adminId));
              }}
              className="-mr-0.5 rounded-full opacity-50 outline-none transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50"
              aria-label={`Remove ${m.name}`}
            >
              <X className="size-3" />
            </button>
          )}
        </Badge>
      ))}
      {!disabled && (
        <Button
          ref={addRef}
          type="button"
          variant="outline"
          size="icon-xs"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          aria-expanded={open}
          className="size-5 rounded-full border-dashed text-muted-foreground"
          aria-label={
            role === "media_buyer"
              ? "Assign media buyer"
              : role === "csm"
                ? "Assign client success manager"
                : "Assign lead"
          }
        >
          <Plus />
        </Button>
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
                aria-pressed={checked}
                className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-left text-sm font-medium outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-[5px] transition-colors",
                    checked ? "bg-primary text-primary-foreground" : "bg-input/90"
                  )}
                >
                  {checked && <Check className="size-3.5" />}
                </span>
                <span className="flex-1 truncate">{opt.name}</span>
                {opt.isMediaBuyer && (
                  <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                    Media
                  </Badge>
                )}
                {opt.isCsm && (
                  <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                    CSM
                  </Badge>
                )}
              </button>
            );
          })}
        </ChipPopover>
      )}
    </div>
  );
}
