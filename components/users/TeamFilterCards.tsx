"use client";

import { useMemo } from "react";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { ClientPublic } from "./types";
import type { TeamRole } from "@/lib/clientProfile";

export interface TeamFilterSelection {
  adminId: string;
  role: TeamRole;
}

interface PersonCard {
  adminId: string;
  role: TeamRole;
  name: string;
  clientCount: number;
  running: number;
  paused: number;
}

const ROLE_LABEL: Record<TeamRole, string> = {
  media_buyer: "Media Buyer",
  lead: "Head of Ads",
  csm: "Client Success Manager",
};

// Buyers first (the primary roster view), then leads, then CSMs — each role
// is its own card group, never merged.
const ROLE_RANK: Record<TeamRole, number> = { media_buyer: 0, lead: 1, csm: 2 };

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Clickable per-person filter cards (one per assigned admin × role across the
 * whole roster): client count + running/paused split. Clicking filters the
 * directory to that person; clicking again (or "All") clears. Computed from
 * the UNFILTERED list so counts stay stable while filtering (the page
 * pre-excludes inactive/archived clients — they never count).
 */
export function TeamFilterCards({
  clients,
  selected,
  onSelect,
}: {
  clients: ClientPublic[];
  selected: TeamFilterSelection | null;
  onSelect: (next: TeamFilterSelection | null) => void;
}) {
  const cards = useMemo(() => {
    const byKey = new Map<string, PersonCard>();
    for (const c of clients) {
      for (const m of c.team) {
        const key = `${m.role}:${m.adminId}`;
        const card =
          byKey.get(key) ??
          ({
            adminId: m.adminId,
            role: m.role,
            name: m.name,
            clientCount: 0,
            running: 0,
            paused: 0,
          } as PersonCard);
        card.clientCount += 1;
        if (c.profile.adsRunning) card.running += 1;
        else card.paused += 1;
        byKey.set(key, card);
      }
    }
    // Role groups in rank order; biggest books first within each.
    return [...byKey.values()].sort(
      (a, b) =>
        ROLE_RANK[a.role] - ROLE_RANK[b.role] ||
        b.clientCount - a.clientCount ||
        a.name.localeCompare(b.name)
    );
  }, [clients]);

  if (cards.length === 0) return null;

  const totalRunning = clients.filter((c) => c.profile.adsRunning).length;

  return (
    <div className="-m-1 flex gap-2 overflow-x-auto p-1">
      <CardButton
        active={selected === null}
        name="All"
        count={clients.length}
        running={totalRunning}
        paused={clients.length - totalRunning}
        onClick={() => onSelect(null)}
      />
      {cards.map((card) => (
        <CardButton
          key={`${card.role}:${card.adminId}`}
          active={
            selected?.adminId === card.adminId && selected?.role === card.role
          }
          role={ROLE_LABEL[card.role]}
          name={card.name}
          count={card.clientCount}
          running={card.running}
          paused={card.paused}
          onClick={() =>
            onSelect(
              selected?.adminId === card.adminId && selected?.role === card.role
                ? null
                : { adminId: card.adminId, role: card.role }
            )
          }
        />
      ))}
    </div>
  );
}

function CardButton({
  active,
  role,
  name,
  count,
  running,
  paused,
  onClick,
}: {
  active: boolean;
  /** Role label ("Media Buyer" …); omitted for the "All" card. */
  role?: string;
  name: string;
  count: number;
  running: number;
  paused: number;
  onClick: () => void;
}) {
  return (
    <Card
      className={cn(
        "shrink-0 min-w-[160px] transition-shadow",
        active && "bg-muted/50 ring-2 ring-ring/40 dark:ring-ring/40"
      )}
    >
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className="flex h-full w-full flex-col gap-2 p-3 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
      >
        <span className="flex min-h-8 min-w-0 items-center gap-2">
          <Avatar className="size-7">
            <AvatarFallback className="text-[10px] font-medium">
              {role ? getInitials(name) : <Users className="size-3.5" />}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            {role && (
              <span className="block truncate text-xs leading-tight text-muted-foreground">
                {role}
              </span>
            )}
            <span className="block truncate text-sm font-medium leading-tight">{name}</span>
          </span>
        </span>
        <span className="block leading-none">
          <span className="text-2xl font-semibold tracking-tight tabular-nums">{count}</span>
          <span className="ml-1 text-xs text-muted-foreground">clients</span>
        </span>
        <span className="flex gap-1.5">
          <StatusBadge tone="success">{running} running</StatusBadge>
          {paused > 0 && <Badge variant="secondary">{paused} paused</Badge>}
        </span>
      </button>
    </Card>
  );
}
