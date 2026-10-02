export const dynamic = "force-dynamic";
// Approval of a closed, calendar-linked draft runs the same best-effort GHL
// attendance/CRM syncs a closer-created deal does.
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { requireDealReviewer, staleDraft } from "@/lib/api/dealDraftActor";
import { getDealDraft, updateDealDraft } from "@/lib/dealDrafts";
import { parseDealDraftFields } from "@/lib/dealDraftFields";
import { parseInvoiceSpec } from "@/lib/invoice/invoiceSpec";
import { approveDealDraft } from "@/lib/dealDraftApproval";
import { logAuditEvent } from "@/lib/auditLog";

interface Ctx {
  params: { id: string };
}

/** 409 that says WHY: someone else reviewed it, or it changed under the reviewer. */
async function conflict(id: string) {
  const now = await getDealDraft(id);
  if (now?.status === "pending") return staleDraft();
  return NextResponse.json({ error: `Draft is already ${now?.status ?? "deleted"}` }, { status: 409 });
}

/**
 * Approve a pending deal draft → creates the deal (+ its draft invoice and
 * contract). Optional `{ fields?, invoice?, note? }` applies the reviewer's
 * last edits first, so "edit + approve" is one request. Nothing is emailed.
 */
export async function POST(request: Request, { params }: Ctx) {
  const guard = await requireDealReviewer();
  if (guard.response) return guard.response;
  const { admin } = guard;

  try {
    let draft = await getDealDraft(params.id);
    if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    if (draft.status !== "pending") {
      return NextResponse.json({ error: `Draft is already ${draft.status}` }, { status: 409 });
    }

    const body = (await request.json().catch(() => ({}))) ?? {};
    // The version the reviewer looked at — an agent revision since then must
    // be reviewed, not approved blind (incl. fields the form doesn't show).
    const baseUpdatedAt = typeof body.baseUpdatedAt === "string" ? body.baseUpdatedAt : undefined;
    if (baseUpdatedAt && baseUpdatedAt !== draft.updatedAt) return staleDraft();
    const patch: Parameters<typeof updateDealDraft>[1] = {};
    if (body.fields && typeof body.fields === "object") {
      const parsed = parseDealDraftFields(body.fields, draft.fields);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      patch.fields = parsed.value;
    }
    if (body.invoice !== undefined) {
      if (body.invoice === null) patch.invoice = null;
      else {
        const spec = parseInvoiceSpec(body.invoice);
        if (!spec.ok) return NextResponse.json({ error: spec.error }, { status: 400 });
        patch.invoice = spec.value;
      }
    }
    if (Object.keys(patch).length > 0) {
      const updated = await updateDealDraft(params.id, patch, draft.updatedAt);
      if (!updated) return conflict(params.id);
      draft = updated;
    }

    const note = body.note ? String(body.note).slice(0, 2000) : null;
    // Approval claims exactly this version (draft.updatedAt) — see approveDealDraftWithInsert.
    const result = await approveDealDraft(draft, { id: admin.id, name: admin.username }, note);
    if (!result.ok) {
      if (result.status === 409) return conflict(params.id);
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "deal.create",
      targetType: "deal",
      targetId: result.deal.id,
      details: JSON.stringify({
        fromDraft: draft.id,
        clientName: result.deal.clientName,
        closerId: result.deal.closerId,
        dealValue: result.deal.dealValue,
        status: result.deal.status,
      }),
    }).catch(() => {});
    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "deal_draft.approve",
      targetType: "deal_draft",
      targetId: draft.id,
      details: JSON.stringify({ dealId: result.deal.id, createdBy: draft.createdByName }),
    }).catch(() => {});

    return NextResponse.json({
      data: { deal: result.deal, invoiceId: result.invoiceId, warnings: result.warnings },
    });
  } catch (err) {
    console.error("[admin/deals/drafts/:id/approve]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
