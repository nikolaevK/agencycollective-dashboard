"use client";

import { Users, ShieldCheck, Clock, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminStatsRowProps {
  totalAdmins: number;
  superAdmins: number;
  recentChanges: number;
  onAddClick: () => void;
  canAdd: boolean;
}

export function AdminStatsRow({ totalAdmins, superAdmins, recentChanges, onAddClick, canAdd }: AdminStatsRowProps) {
  const cards = [
    { label: "Total Admins", value: totalAdmins, icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Super Admins", value: superAdmins, icon: ShieldCheck, color: "text-primary", bg: "bg-primary/10" },
    { label: "Recent Changes", value: recentChanges, icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", card.bg)}>
              <card.icon className={cn("h-4 w-4", card.color)} />
            </div>
          </div>
          <p className="text-2xl font-bold">{card.value}</p>
          <p className="text-xs text-muted-foreground">{card.label}</p>
        </div>
      ))}
      {canAdd && (
        <button
          onClick={onAddClick}
          className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4 flex flex-col items-center justify-center gap-1 hover:bg-primary/10 transition-colors"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Plus className="h-4 w-4 text-primary" />
          </div>
          <p className="text-sm font-medium text-primary">Add Admin</p>
        </button>
      )}
    </div>
  );
}
