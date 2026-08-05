export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { readAdmins } from "@/lib/admins";
import { ensureMigrated } from "@/lib/db";
import { getClientTeam, setClientTeam, type TeamRole } from "@/lib/clientProfile";
import { requireClientRouteActor } from "@/lib/api/requireAdmin";
import { workspaceMembershipOf, scopesOverlap } from "@/lib/workspaces";

interface RouteContext {
  params: { userId: string };
}

/**
 * Replace the assignment set for one (client, role): body
 * `{ role: 'media_buyer' | 'lead' | 'csm', adminIds: string[] }`. Unknown
 * admin ids are dropped silently; the other roles' assignments are untouched.
 */
export async function PUT(request: Request, { params }: RouteContext) {
  await ensureMigrated();

  const guard = await requireClientRouteActor(params.userId);
  if (guard.response) return guard.response;
  const admin = guard.actor.admin;

  try {
    const body = (await request.json()) as {
      role?: unknown;
      adminIds?: unknown;
    };

    if (body.role !== "media_buyer" && body.role !== "lead" && body.role !== "csm")
      return NextResponse.json(
        { error: "role must be 'media_buyer', 'lead', or 'csm'" },
        { status: 400 }
      );
    if (!Array.isArray(body.adminIds))
      return NextResponse.json({ error: "adminIds must be an array" }, { status: 400 });

    // Assignable admins: for a scoped actor, only admins who BELONG to one of
    // their books (explicit membership) — a partner book can't attach an
    // internal admin, and vice versa. Unscoped actors can assign anyone.
    const known = new Set(
      (await readAdmins())
        .filter((a) => scopesOverlap(guard.actor.scope, workspaceMembershipOf(a)))
        .map((a) => a.id)
    );
    const adminIds = body.adminIds
      .map((id) => String(id))
      .filter((id) => known.has(id));

    await setClientTeam(params.userId, body.role as TeamRole, adminIds, admin.id);

    const team = await getClientTeam(params.userId);
    return NextResponse.json({ data: { team } });
  } catch (err) {
    console.error("[client-team] PUT failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
