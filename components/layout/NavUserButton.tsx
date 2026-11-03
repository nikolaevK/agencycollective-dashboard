"use client";

import { forwardRef } from "react";
import Image from "next/image";
import { ChevronsUpDown } from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import { useAdmin } from "@/components/providers/AdminProvider";
import { SidebarMenuButton } from "@/components/ui/sidebar";

/** "Super Admin" / "Admin" — the role line under the name. */
export function useAdminIdentity() {
  const admin = useAdmin();
  const roleLabel = admin.isSuper ? "Super Admin" : "Admin";
  return {
    name: admin.displayName || admin.username,
    // The username is only worth a line when a display name hides it.
    detail: admin.displayName ? `${admin.username} · ${roleLabel}` : roleLabel,
  };
}

/** The signed-in admin's photo, or their initials (kit Avatar look, no Radix). */
export function UserAvatar({ className }: { className?: string }) {
  const admin = useAdmin();
  return (
    <span
      className={cn(
        "relative flex size-8 shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-medium text-muted-foreground after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken dark:after:mix-blend-lighten",
        className
      )}
    >
      {admin.avatarPath ? (
        <Image src={admin.avatarPath} alt="" width={32} height={32} className="size-full object-cover" />
      ) : (
        getInitials(admin.displayName, admin.username)
      )}
    </span>
  );
}

/**
 * Sidebar footer account button (shadcn NavUser trigger). Static on purpose:
 * it stands in for the lazily loaded dropdown (NavUser) until that chunk
 * arrives, then becomes its trigger.
 */
export const NavUserButton = forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<"button">>(
  ({ className, ...props }, ref) => {
    const { name, detail } = useAdminIdentity();
    return (
      <SidebarMenuButton
        ref={ref}
        size="lg"
        className={cn(
          "data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
          className
        )}
        {...props}
      >
        <UserAvatar />
        <span className="grid min-w-0 flex-1 text-left leading-tight">
          <span className="truncate font-medium">{name}</span>
          <span className="truncate text-xs text-muted-foreground">{detail}</span>
        </span>
        <ChevronsUpDown className="ml-auto text-muted-foreground" />
      </SidebarMenuButton>
    );
  }
);
NavUserButton.displayName = "NavUserButton";
