import type { AdminPermissions } from "@/lib/permissions";
import { PERMISSION_MODULES } from "@/lib/permissions";
import { badgeTone } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface AdminPermissionGridProps {
  permissions: AdminPermissions;
  isSuper: boolean;
}

/** One letter tile per module: filled = granted, toned = granted elevated
 *  module, faint = not granted. Hover shows the module name. */
export function AdminPermissionGrid({ permissions, isSuper }: AdminPermissionGridProps) {
  return (
    <div className="flex items-center gap-0.5">
      {PERMISSION_MODULES.map((mod) => {
        const active = isSuper || permissions[mod.key];
        return (
          <span
            key={mod.key}
            role="img"
            title={mod.label}
            aria-label={`${mod.label}: ${active ? "granted" : "not granted"}`}
            className={cn(
              "flex size-[18px] items-center justify-center rounded-[5px] border border-transparent text-[9px] font-semibold",
              active
                ? mod.elevated
                  ? badgeTone.warning
                  : "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground/50"
            )}
          >
            {mod.label[0]}
          </span>
        );
      })}
    </div>
  );
}
