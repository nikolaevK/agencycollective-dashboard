"use client";

import { Handshake, Users, Megaphone, BookOpen, ScrollText, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
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
 */
export function ScopeSelector({ scopes, onChange, disabled }: ScopeSelectorProps) {
  return (
    <div className="space-y-2">
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
              "flex flex-col gap-2 rounded-lg border px-3 py-2.5 transition-colors sm:flex-row sm:items-center sm:justify-between",
              active ? "border-primary/30 bg-primary/5" : "border-border bg-background",
              disabled && "opacity-50 pointer-events-none"
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
              <div className="min-w-0">
                <p className="text-sm font-medium">{mod.label}</p>
                <p className="text-xs text-muted-foreground truncate">{mod.description}</p>
              </div>
            </div>
            <div className="flex shrink-0 rounded-lg border border-border bg-background p-0.5">
              {levels.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(mod.key, opt.value)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    level === opt.value
                      ? opt.value === "none"
                        ? "bg-muted text-foreground"
                        : opt.value === "delete"
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          : "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
