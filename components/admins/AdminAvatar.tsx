import Image from "next/image";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn, getInitials } from "@/lib/utils";
import type { AdminPublic } from "./types";

/** Admin avatar (uploaded image, else initials) — shared by the table + cards. */
export function AdminAvatar({
  admin,
  size,
}: {
  admin: Pick<AdminPublic, "avatarPath" | "displayName" | "username">;
  size: 32 | 40;
}) {
  return (
    <Avatar className={size === 40 ? "size-10" : "size-8"}>
      {admin.avatarPath ? (
        <Image
          src={admin.avatarPath}
          alt=""
          width={size}
          height={size}
          className="size-full rounded-full object-cover"
        />
      ) : (
        <AvatarFallback className={cn("font-medium", size === 40 ? "text-sm" : "text-xs")}>
          {getInitials(admin.displayName, admin.username)}
        </AvatarFallback>
      )}
    </Avatar>
  );
}
