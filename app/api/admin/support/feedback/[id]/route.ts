export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import {
  deleteFeedback,
  findFeedback,
  isFeedbackStatus,
  updateFeedbackStatus,
} from "@/lib/feedback";
import { logAuditEvent } from "@/lib/auditLog";
import { waitUntil } from "@vercel/functions";

interface Params { params: { id: string } }

export async function PATCH(request: Request, { params }: Params) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await findFeedback(params.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload.status !== undefined) {
    if (!isFeedbackStatus(payload.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    await updateFeedbackStatus(params.id, payload.status);
  }

  const updated = await findFeedback(params.id);
  return NextResponse.json({ data: updated });
}

/**
 * Hard-delete a feedback entry (and its replies). Audit-logged because it's
 * destructive — the client loses their submission, the team loses the dispute
 * trail. Audit write runs inside waitUntil so Vercel doesn't kill the lambda
 * before the row lands, with a .catch so a logging hiccup never blocks the
 * actual delete.
 */
export async function DELETE(_request: Request, { params }: Params) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await findFeedback(params.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { deleted, repliesDeleted } = await deleteFeedback(params.id);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // waitUntil keeps the lambda alive until the audit write lands.
  waitUntil(
    logAuditEvent({
      adminId: session.adminId,
      adminUsername: session.username,
      action: "support.delete_feedback",
      targetType: "feedback",
      targetId: params.id,
      details: JSON.stringify({
        userId: existing.userId,
        sentiment: existing.sentiment,
        rating: existing.rating,
        repliesDeleted,
      }),
    }).catch(() => {})
  );

  return NextResponse.json({ data: { deleted: true, repliesDeleted } });
}
