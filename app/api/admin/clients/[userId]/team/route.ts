export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin, readAdmins } from "@/lib/admins";
import { ensureMigrated } from "@/lib/db";
import { findUser } from "@/lib/users";
import { getClientTeam, setClientTeam, type TeamRole } from "@/lib/clientProfile";

async function requireAdminSession() {
  const session = getAdminSession();
  if (!session) return null;
  return findAdmin(session.adminId);
}

interface RouteContext {
  params: { userId: string };
}

/**
 * Replace the assignment set for one (client, role): body
 * `{ role: 'media_buyer' | 'lead' | 'csm', adminIds: string[] }`. Unknown
 * admin ids are dropped silently; the other roles' assignments are untouched.
 */
export async function PUT(request: Request, { params }: RouteContext) {
  const admin = await requireAdminSession();
  if (!admin)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  const user = await findUser(params.userId);
  if (!user)
    return NextResponse.json({ error: "Client not found" }, { status: 404 });

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

    const known = new Set((await readAdmins()).map((a) => a.id));
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
