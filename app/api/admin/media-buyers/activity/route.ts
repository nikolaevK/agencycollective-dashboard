export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import {
  getAuditLogsByTargetPrefix,
  clearAuditLogsByTargetPrefix,
  logAuditEvent,
} from "@/lib/auditLog";

function requireMediaAdmin() {
  const session = getAdminSession();
  if (!session) return null;
  if (!session.isSuper && !session.permissions.media && !session.permissions.media_manage) {
    return null;
  }
  return session;
}

/** Clearing activity is restricted to super admins + Head of Paid Media. */
function requireMediaManager() {
  const session = getAdminSession();
  if (!session) return null;
  if (!session.isSuper && !session.permissions.media_manage) return null;
  return session;
}

const ALLOWED_CLEAR_DAYS = new Set([7, 30, 90]);

export async function GET(request: Request) {
  const session = requireMediaAdmin();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const limitRaw = Number(searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 200) : 50;

  try {
    const entries = await getAuditLogsByTargetPrefix("media_", limit);
    return NextResponse.json({ data: entries });
  } catch (err) {
    console.error("[admin/media-buyers/activity GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = requireMediaManager();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const all = searchParams.get("all") === "1";

  let olderThanDays: number | null;
  if (all) {
    olderThanDays = null;
  } else {
    const n = Number(searchParams.get("olderThanDays"));
    if (!ALLOWED_CLEAR_DAYS.has(n)) {
      return NextResponse.json({ error: "Provide all=1 or olderThanDays ∈ {7,30,90}" }, { status: 400 });
    }
    olderThanDays = n;
  }

  try {
    const removed = await clearAuditLogsByTargetPrefix("media_", olderThanDays);
    // Record the clear itself for accountability (destructive, admin-only).
    logAuditEvent({
      adminId: session.adminId,
      adminUsername: session.username,
      action: "media_activity.clear",
      targetType: "media_activity",
      details: JSON.stringify({ olderThanDays: olderThanDays ?? "all", removed }),
    }).catch(() => {});
    return NextResponse.json({ ok: true, removed });
  } catch (err) {
    console.error("[admin/media-buyers/activity DELETE]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
