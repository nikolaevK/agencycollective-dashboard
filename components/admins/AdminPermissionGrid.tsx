"use client";

import type { AdminPermissions } from "@/lib/permissions";
import { PERMISSION_MODULES } from "@/lib/permissions";

interface AdminPermissionGridProps {
  permissions: AdminPermissions;
  isSuper: boolean;
}

export function AdminPermissionGrid({ permissions, isSuper }: AdminPermissionGridProps) {
  return (
    <div className="flex items-center gap-1">
      {PERMISSION_MODULES.map((mod) => {
        const active = isSuper || permissions[mod.key];
        return (
          <div
            key={mod.key}
            title={mod.label}
            className={`h-5 w-5 rounded text-[8px] font-bold flex items-center justify-center ${
              active
                ? mod.elevated
                  ? "bg-amber-500/20 text-amber-500"
                  : "bg-primary/20 text-primary"
                : "bg-muted text-muted-foreground/40"
            }`}
          >
            {mod.label[0]}
          </div>
        );
      })}
    </div>
  );
}
