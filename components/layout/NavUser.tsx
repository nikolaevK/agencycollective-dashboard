"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NavUserButton, UserAvatar, useAdminIdentity } from "@/components/layout/NavUserButton";

/**
 * The admin's account menu in the sidebar footer — the ONE place for account
 * actions on desktop and in the mobile drawer. Loaded with next/dynamic by
 * the Sidebar, so the Radix dropdown stays out of the shell's first load.
 */
export function NavUser({ side = "top" }: { side?: "top" | "right" }) {
  const router = useRouter();
  const { name, detail } = useAdminIdentity();

  async function handleLogout() {
    await fetch("/api/auth/admin/logout", { method: "POST" });
    // Creative Studio keeps generated images in this browser — don't leave them for the next admin.
    void import("@/components/generate/imageStore").then((m) => m.clearStoredImages()).catch(() => {});
    router.push("/?portal=admin");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <NavUserButton />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={side}
        align={side === "right" ? "end" : "start"}
        sideOffset={side === "right" ? 8 : 4}
        collisionPadding={8}
        className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-56"
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-2 py-1.5 text-left text-sm">
            <UserAvatar />
            <div className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate font-medium text-foreground">{name}</span>
              <span className="truncate text-xs text-muted-foreground">{detail}</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void handleLogout()}>
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
