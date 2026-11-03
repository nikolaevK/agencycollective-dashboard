"use client";

import { useId } from "react";
import { LayoutDashboard, Sparkles, ImageIcon, Braces, PenTool, FileText, Users, Handshake, Megaphone, ClipboardCheck, ShieldCheck, KeyRound, Boxes } from "lucide-react";
import { cn } from "@/lib/utils";
import { badgeVariants } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import type { AdminPermissions, PermissionKey } from "@/lib/permissions";
import { PERMISSION_MODULES } from "@/lib/permissions";

const ICON_MAP: Record<string, typeof LayoutDashboard> = {
  LayoutDashboard,
  Sparkles,
  ImageIcon,
  Braces,
  PenTool,
  FileText,
  Users,
  Handshake,
  Megaphone,
  ClipboardCheck,
  ShieldCheck,
  KeyRound,
  Boxes,
};

interface PermissionToggleListProps {
  permissions: AdminPermissions;
  onChange: (key: PermissionKey, value: boolean) => void;
  disabled?: boolean;
}

export function PermissionToggleList({ permissions, onChange, disabled }: PermissionToggleListProps) {
  // The desktop modal and the mobile form are mounted together (one hidden
  // by CSS), so ids must be unique per instance or a label would toggle the
  // other form's switch.
  const idPrefix = useId();

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {PERMISSION_MODULES.map((mod) => {
        const Icon = ICON_MAP[mod.icon] ?? LayoutDashboard;
        const checked = permissions[mod.key];
        const id = `${idPrefix}-${mod.key}`;

        return (
          <label
            key={mod.key}
            htmlFor={id}
            className={cn(
              "flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 transition-colors",
              checked ? "bg-muted/60" : "bg-transparent",
              disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted/40"
            )}
          >
            <span className="flex min-w-0 items-center gap-3">
              <Icon className={cn("size-4 shrink-0", checked ? "text-foreground" : "text-muted-foreground")} />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                  {mod.label}
                  {mod.elevated && (
                    <span className={cn(badgeVariants({ variant: "outline", tone: "warning" }), "h-4 px-1.5 text-[10px]")}>
                      Elevated
                    </span>
                  )}
                </span>
                <span className="block text-xs text-muted-foreground">{mod.description}</span>
              </span>
            </span>
            <Switch
              id={id}
              checked={checked}
              onCheckedChange={(value) => onChange(mod.key, value)}
              disabled={disabled}
            />
          </label>
        );
      })}
    </div>
  );
}
