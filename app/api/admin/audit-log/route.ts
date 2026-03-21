export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { getRecentAuditLogs } from "@/lib/auditLog";

export async function GET() {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = await findAdmin(session.adminId);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Require admin permission or super admin
  if (!admin.isSuper && !admin.permissions.admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const logs = await getRecentAuditLogs(50);
    return NextResponse.json({ data: logs });
  } catch (err) {
    console.error("GET /api/admin/audit-log error:", err);
    return NextResponse.json({ data: [] });
  }
}
