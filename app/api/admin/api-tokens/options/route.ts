export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { readUsers } from "@/lib/users";
import { readClosers } from "@/lib/closers";

/**
 * Lightweight client/closer pickers for the token resource-scoping UI.
 * Lives under /api/admin/api-tokens so it shares the `admin` middleware
 * permission — the users/closers list routes require different perms.
 */
export async function GET() {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = await findAdmin(session.adminId);
  if (!admin || (!admin.isSuper && !admin.permissions.apitokens)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [users, closers] = await Promise.all([readUsers(), readClosers()]);
  return NextResponse.json({
    data: {
      clients: users.map((u) => ({ id: u.id, name: u.displayName })),
      closers: closers.map((c) => ({
        id: c.id,
        name: c.displayName,
        role: c.role,
      })),
    },
  });
}
