export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { findApiToken, getTokenUsage } from "@/lib/apiTokens";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/** Verify admin session + the `apitokens` permission (supers bypass). */
async function requireAdmin() {
  const session = getAdminSession();
  if (!session) return null;
  const admin = await findAdmin(session.adminId);
  if (!admin) return null;
  if (!admin.isSuper && !admin.permissions.apitokens) return null;
  return admin;
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const token = await findApiToken(params.id);
  if (!token) return NextResponse.json({ error: "Token not found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const rawDays = Number(searchParams.get("days"));
  const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(rawDays, 365) : 30;

  const usage = await getTokenUsage(params.id, days);
  return NextResponse.json({ data: { usage, days } });
}
