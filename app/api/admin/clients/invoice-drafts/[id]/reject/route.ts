export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { requireDirectoryActor } from "@/lib/api/requireAdmin";
import { getInvoiceDraft, rejectInvoiceDraft, invoiceDraftConflictMessage } from "@/lib/invoiceDrafts";
import { logAuditEvent } from "@/lib/auditLog";
import { loadScopedInvoiceDraft } from "@/lib/api/invoiceDraftScope";

/** Decline a pending invoice draft. `{ note? }` is visible to the agent via the API. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const actor = await requireDirectoryActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureMigrated();
  try {
    const found = await loadScopedInvoiceDraft(actor, params.id);
    if (!found) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) ?? {};
    const note = body.note ? String(body.note).trim().slice(0, 2000) || null : null;
    const ok = await rejectInvoiceDraft(params.id, {
      reviewedBy: actor.admin.id,
      reviewedByName: actor.admin.username,
      note,
    });
    if (!ok) return NextResponse.json({ error: await invoiceDraftConflictMessage(params.id) }, { status: 409 });
    logAuditEvent({
      adminId: actor.admin.id,
      adminUsername: actor.admin.username,
      action: "invoice_draft.reject",
      targetType: "invoice_draft",
      targetId: params.id,
      details: JSON.stringify({ kind: found.draft.kind, note }),
    }).catch(() => {});
    return NextResponse.json({ data: await getInvoiceDraft(params.id) });
  } catch (err) {
    console.error("[admin/clients/invoice-drafts/:id/reject]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
