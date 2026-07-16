export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { readAdmins } from "@/lib/admins";
import { ensureMigrated } from "@/lib/db";
import { requireAdminRecord as requireAdminSession } from "@/lib/api/requireAdmin";

/**
 * Assignable people for the roster Lead / Media Buyer pickers — the admins
 * table, mapped to a minimal public shape (never the password hash). Lives
 * under /api/admin/clients/ so it's gated by the `users` permission like the
 * rest of the Client Directory ( /api/admin/admins requires the `admin` perm,
 * which directory admins don't necessarily hold).
 */
export async function GET() {
  if (!(await requireAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  const admins = await readAdmins();
  return NextResponse.json({
    data: admins.map((a) => ({
      id: a.id,
      name: a.displayName?.trim() || a.username,
      avatarPath: a.avatarPath,
      // Raw perm_media flag (not effective perms — supers would all read as
      // media buyers otherwise). Used to sort/badge the buyer picker.
      isMediaBuyer: a.permissions.media,
      // Admins-side role slug (admins.role) — a CSM shares the Media Buyer
      // permission set but is its own role; used to sort/badge the CSM picker.
      isCsm: a.role === "csm",
    })),
  });
}
