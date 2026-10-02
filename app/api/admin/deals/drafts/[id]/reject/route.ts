export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireDealReviewer } from "@/lib/api/dealDraftActor";
import { getDealDraft, rejectDealDraft } from "@/lib/dealDrafts";
import { logAuditEvent } from "@/lib/auditLog";

/** Decline a pending deal draft. `{ note? }` is returned to the agent via the API. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireDealReviewer();
  if (guard.response) return guard.response;
  try {
    const draft = await getDealDraft(params.id);
    if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) ?? {};
    const note = body.note ? String(body.note).slice(0, 2000) : null;
    const ok = await rejectDealDraft(params.id, {
      reviewedBy: guard.admin.id,
      reviewedByName: guard.admin.username,
      note,
    });
    if (!ok) {
      // Report the status that won the race, not the one read before it.
      const now = await getDealDraft(params.id);
      return NextResponse.json({ error: `Draft is already ${now?.status ?? "deleted"}` }, { status: 409 });
    }
    logAuditEvent({
      adminId: guard.admin.id,
      adminUsername: guard.admin.username,
      action: "deal_draft.reject",
      targetType: "deal_draft",
      targetId: params.id,
      details: JSON.stringify({ clientName: draft.fields.clientName, note }),
    }).catch(() => {});
    return NextResponse.json({ data: await getDealDraft(params.id) });
  } catch (err) {
    console.error("[admin/deals/drafts/:id/reject]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
