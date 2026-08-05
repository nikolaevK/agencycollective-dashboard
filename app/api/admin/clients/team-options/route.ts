export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { readAdmins } from "@/lib/admins";
import { ensureMigrated } from "@/lib/db";
import { requireDirectoryActor } from "@/lib/api/requireAdmin";
import { workspaceMembershipOf, scopesOverlap } from "@/lib/workspaces";

/**
 * Assignable people for the roster Lead / Media Buyer pickers — the admins
 * table, mapped to a minimal public shape (never the password hash). Lives
 * under /api/admin/clients/ so it's gated by the `users` permission like the
 * rest of the Client Directory ( /api/admin/admins requires the `admin` perm,
 * which directory admins don't necessarily hold).
 */
export async function GET() {
  const actor = await requireDirectoryActor();
  if (!actor)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  // Workspace scoping: a scoped actor only sees admins who BELONG to one of
  // their books (explicit membership — privilege grants visibility, not
  // membership) — partner pickers never list the internal team, and vice
  // versa. Unscoped actors see everyone.
  const admins = (await readAdmins()).filter((a) =>
    scopesOverlap(actor.scope, workspaceMembershipOf(a))
  );
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
