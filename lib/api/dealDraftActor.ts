import { NextResponse } from "next/server";
import { requireAdminRecord } from "@/lib/api/requireAdmin";
import type { AdminRecord } from "@/lib/admins";

/**
 * Admin guard for the deal-draft review routes. Middleware already gates
 * /api/admin/deals* on the `closers` permission; approval creates a real deal,
 * so the route re-checks it against the fresh DB record (defense in depth).
 */
export async function requireDealReviewer(): Promise<
  { admin: AdminRecord; response?: never } | { admin?: never; response: NextResponse }
> {
  const admin = await requireAdminRecord();
  if (!admin) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!admin.isSuper && !admin.permissions.closers) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { admin };
}

/** 409 for a draft that changed (e.g. an agent revised it) since the reviewer opened it. */
export function staleDraft() {
  return NextResponse.json(
    { error: "This draft changed since you opened it — load the latest version and review it again.", code: "stale" },
    { status: 409 }
  );
}
