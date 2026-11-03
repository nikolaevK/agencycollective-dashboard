"use client";

import { forwardRef, useState } from "react";
import Image from "next/image";
import { ChevronsUpDown, LogOut } from "lucide-react";
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

/**
 * The signed-in admin's photo, or their initials (kit Avatar look, no Radix).
 * Decorative: the name always sits next to it, so the initials stay out of
 * the account button's accessible name.
 */
export function UserAvatar({ className }: { className?: string }) {
  const admin = useAdmin();
  return (
    <span
      aria-hidden
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

/**
 * Log out: end the session, forget Creative Studio's stored images, then a
 * HARD navigation to the login page — it drops the React Query cache and
 * every in-memory store, so nothing of this admin's survives into the next
 * admin's session in the same tab (a client-side push kept it all).
 */
export async function logOutAdmin() {
  await fetch("/api/auth/admin/logout", { method: "POST" });
  // Creative Studio keeps generated images in this browser — don't leave them for the next admin.
  // Awaited so the page unload can't cut it short; capped so a stuck IndexedDB can't block logging out.
  await Promise.race([
    import("@/components/generate/imageStore").then((m) => m.clearStoredImages()).catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
  window.location.assign("/?portal=admin");
}

/**
 * Stands in for NavUser when its chunk fails to load (deploy skew, flaky
 * network, an ad-blocker): the same button, toggling a plain Log out button
 * above it — no Radix, nothing else to fetch.
 */
export function NavUserFallback() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && (
        <SidebarMenuButton onClick={() => void logOutAdmin()} tooltip="Log out" className="mb-1">
          <LogOut />
          <span>Log out</span>
        </SidebarMenuButton>
      )}
      <NavUserButton
        aria-expanded={open}
        data-state={open ? "open" : "closed"}
        onClick={() => setOpen((o) => !o)}
      />
    </>
  );
}
