import Image from "next/image";
import { cn, getInitials } from "@/lib/utils";
import type { AdminPublic } from "./types";

/** Admin avatar (uploaded image, else initials) — shared by the table + cards.
 *  Plain spans in the kit Avatar's look: Radix Avatar only adds image-load
 *  tracking, which this (next/image or initials, never both) doesn't use. */
export function AdminAvatar({
  admin,
  size,
}: {
  admin: Pick<AdminPublic, "avatarPath" | "displayName" | "username">;
  size: 32 | 40;
}) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 select-none rounded-full after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken dark:after:mix-blend-lighten",
        size === 40 ? "size-10" : "size-8"
      )}
    >
      {admin.avatarPath ? (
        <Image
          src={admin.avatarPath}
          alt=""
          width={size}
          height={size}
          className="size-full rounded-full object-cover"
        />
      ) : (
        <span
          className={cn(
            "flex size-full items-center justify-center rounded-full bg-muted font-medium text-muted-foreground",
            size === 40 ? "text-sm" : "text-xs"
          )}
        >
          {getInitials(admin.displayName, admin.username)}
        </span>
      )}
    </span>
  );
}
