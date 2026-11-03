"use client";

import { Handshake, Users, Megaphone, BookOpen, ScrollText, UsersRound, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { badgeTone } from "@/components/ui/badge";
import {
  SCOPE_MODULES,
  type AccessLevel,
  type ResourceKey,
  type TokenScopes,
} from "@/lib/apiScopes";

const ICON_MAP: Record<string, typeof LayoutDashboard> = {
  Handshake,
  Users,
  Megaphone,
  BookOpen,
  ScrollText,
  UsersRound,
};

const LEVELS: { value: AccessLevel; label: string }[] = [
  { value: "none", label: "None" },
  { value: "read", label: "Read" },
  { value: "write", label: "Write" },
  { value: "delete", label: "Delete" },
];

interface ScopeSelectorProps {
  scopes: TokenScopes;
  onChange: (key: ResourceKey, level: AccessLevel) => void;
  disabled?: boolean;
}

/**
 * Per-resource access-level selector — the token analogue of the Admins
 * page's PermissionToggleList, but tri-state+none instead of a boolean
 * switch. Levels are ordinal: delete ⇒ write ⇒ read.
 *
 * Plain buttons on purpose (no Radix): the public OAuth consent page renders
 * this too and stays light.
 */
export function ScopeSelector({ scopes, onChange, disabled }: ScopeSelectorProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {SCOPE_MODULES.map((mod) => {
        const Icon = ICON_MAP[mod.icon] ?? LayoutDashboard;
        const level: AccessLevel = scopes[mod.key] ?? "none";
        const active = level !== "none";
        const levels = mod.maxLevel
          ? LEVELS.slice(0, LEVELS.findIndex((l) => l.value === mod.maxLevel) + 1)
          : LEVELS;

        return (
          <div
            key={mod.key}
            className={cn(
              "flex flex-col gap-2 rounded-2xl border px-3 py-2.5 transition-colors sm:flex-row sm:items-center sm:justify-between",
              active ? "bg-muted/60" : "bg-transparent",
              disabled && "opacity-50 pointer-events-none"
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              <Icon className={cn("size-4 shrink-0", active ? "text-foreground" : "text-muted-foreground")} />
              <div className="min-w-0">
                <p className="text-sm font-medium">{mod.label}</p>
                <p className="text-xs text-muted-foreground">{mod.description}</p>
              </div>
            </div>
            <div
              role="group"
              aria-label={`${mod.label} access`}
              className="flex shrink-0 self-start rounded-3xl bg-muted p-0.5 sm:self-auto"
            >
              {levels.map((opt) => {
                const selected = level === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={selected}
                    disabled={disabled}
                    onClick={() => onChange(mod.key, opt.value)}
                    className={cn(
                      "rounded-3xl border border-transparent px-2.5 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/30",
                      selected
                        ? opt.value === "none"
                          ? "bg-background text-foreground shadow-sm"
                          : opt.value === "delete"
                            ? badgeTone.warning
                            : "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
