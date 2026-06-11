"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
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
};

/**
 * Clickable per-person filter cards (one per assigned admin × role across the
 * whole roster): client count + running/paused split. Clicking filters the
 * directory to that person; clicking again (or "All") clears. Computed from
 * the UNFILTERED list so counts stay stable while filtering.
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
    // Buyers first (the primary roster view), then leads; biggest books first.
    return [...byKey.values()].sort(
      (a, b) =>
        (a.role === "media_buyer" ? 0 : 1) - (b.role === "media_buyer" ? 0 : 1) ||
        b.clientCount - a.clientCount ||
        a.name.localeCompare(b.name)
    );
  }, [clients]);

  if (cards.length === 0) return null;

  const totalRunning = clients.filter((c) => c.profile.adsRunning).length;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      <CardButton
        active={selected === null}
        title="All"
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
          title={`${ROLE_LABEL[card.role]} · ${card.name}`}
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
  title,
  count,
  running,
  paused,
  onClick,
}: {
  active: boolean;
  title: string;
  count: number;
  running: number;
  paused: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 min-w-[140px] rounded-xl border p-3 text-left transition-all",
        active
          ? "border-primary ring-2 ring-primary/20 bg-primary/[0.03]"
          : "border-border/50 bg-card hover:border-border"
      )}
    >
      <p
        className={cn(
          "text-xs font-bold leading-tight",
          active ? "text-primary" : "text-foreground"
        )}
      >
        {title}
      </p>
      <p className="text-2xl font-black text-foreground mt-1 leading-none">
        {count}
        <span className="ml-1 text-[10px] font-semibold text-muted-foreground uppercase">
          clients
        </span>
      </p>
      <div className="flex gap-1.5 mt-2">
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          {running} running
        </span>
        {paused > 0 && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground">
            {paused} paused
          </span>
        )}
      </div>
    </button>
  );
}
