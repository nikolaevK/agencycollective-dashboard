"use client";

import { LayoutDashboard, Sparkles, ImageIcon, PenTool, Users, Handshake, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminPermissions, PermissionKey } from "@/lib/permissions";
import { PERMISSION_MODULES } from "@/lib/permissions";

const ICON_MAP: Record<string, typeof LayoutDashboard> = {
  LayoutDashboard,
  Sparkles,
  ImageIcon,
  PenTool,
  Users,
  Handshake,
  ShieldCheck,
};

interface PermissionToggleListProps {
  permissions: AdminPermissions;
  onChange: (key: PermissionKey, value: boolean) => void;
  disabled?: boolean;
}

export function PermissionToggleList({ permissions, onChange, disabled }: PermissionToggleListProps) {
  return (
    <div className="space-y-2">
      {PERMISSION_MODULES.map((mod) => {
        const Icon = ICON_MAP[mod.icon] ?? LayoutDashboard;
        const checked = permissions[mod.key];

        return (
          <div
            key={mod.key}
            role="button"
            tabIndex={disabled ? -1 : 0}
            onClick={() => !disabled && onChange(mod.key, !checked)}
            onKeyDown={(e) => {
              if (!disabled && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onChange(mod.key, !checked);
              }
            }}
            className={cn(
              "flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors cursor-pointer",
              checked ? "border-primary/30 bg-primary/5" : "border-border bg-background",
              mod.elevated && "ring-1 ring-amber-500/20",
              disabled && "opacity-50 pointer-events-none"
            )}
          >
            <div className="flex items-center gap-3">
              <Icon className={cn("h-4 w-4", checked ? "text-primary" : "text-muted-foreground")} />
              <div>
                <p className="text-sm font-medium">{mod.label}</p>
                <p className="text-xs text-muted-foreground">{mod.description}</p>
              </div>
            </div>
            <div
              role="switch"
              aria-checked={checked}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors",
                checked ? "bg-primary" : "bg-muted"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform mt-0.5",
                  checked ? "translate-x-4 ml-0.5" : "translate-x-0.5"
                )}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
