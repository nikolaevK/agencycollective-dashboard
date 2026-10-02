export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireDealReviewer, staleDraft } from "@/lib/api/dealDraftActor";
import { getDealDraft, updateDealDraft, deleteDealDraft } from "@/lib/dealDrafts";
import { parseDealDraftFields } from "@/lib/dealDraftFields";
import { parseInvoiceSpec } from "@/lib/invoice/invoiceSpec";
import { buildDealDraftInvoicePreview } from "@/lib/dealDraftApproval";
import { findCloser } from "@/lib/closers";
import { findUser } from "@/lib/users";
import { logAuditEvent } from "@/lib/auditLog";

interface Ctx {
  params: { id: string };
}

/** Draft + the invoice approval would generate (for the review drawer). */
export async function GET(_req: Request, { params }: Ctx) {
  const guard = await requireDealReviewer();
  if (guard.response) return guard.response;
  try {
    const draft = await getDealDraft(params.id);
    if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    const f = draft.fields;
    const [closer, setter, clientUser, invoicePreview] = await Promise.all([
      findCloser(f.closerId),
      f.setterId ? findCloser(f.setterId) : null,
      f.clientUserId ? findUser(f.clientUserId) : null,
      buildDealDraftInvoicePreview(draft).catch((err) => {
        console.error("[admin/deals/drafts/:id GET] preview failed:", err);
        return null;
      }),
    ]);
    return NextResponse.json({
      data: {
        ...draft,
        closerName: closer?.displayName ?? null,
        invoicePreview,
        // Names for the fields approval applies that the form doesn't edit.
        refs: { setterName: setter?.displayName ?? null, clientUserName: clientUser?.displayName ?? null },
      },
    });
  } catch (err) {
    console.error("[admin/deals/drafts/:id GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Edit a pending draft before approving: `{ fields?, invoice?, note? }`. */
export async function PATCH(request: Request, { params }: Ctx) {
  const guard = await requireDealReviewer();
  if (guard.response) return guard.response;
  try {
    const draft = await getDealDraft(params.id);
    if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    if (draft.status !== "pending") {
      return NextResponse.json({ error: `Draft is already ${draft.status}` }, { status: 409 });
    }
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    const baseUpdatedAt = typeof body.baseUpdatedAt === "string" ? body.baseUpdatedAt : undefined;
    if (baseUpdatedAt && baseUpdatedAt !== draft.updatedAt) return staleDraft();

    const patch: Parameters<typeof updateDealDraft>[1] = {};
    if (body.fields !== undefined) {
      if (!body.fields || typeof body.fields !== "object") {
        return NextResponse.json({ error: "fields must be an object" }, { status: 400 });
      }
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
    if (body.note !== undefined) patch.note = body.note ? String(body.note).slice(0, 2000) : null;

    const updated = await updateDealDraft(params.id, patch, baseUpdatedAt);
    if (!updated) {
      const now = await getDealDraft(params.id);
      if (now?.status === "pending") return staleDraft();
      return NextResponse.json({ error: `Draft is already ${now?.status ?? "deleted"}` }, { status: 409 });
    }

    logAuditEvent({
      adminId: guard.admin.id,
      adminUsername: guard.admin.username,
      action: "deal_draft.update",
      targetType: "deal_draft",
      targetId: params.id,
      details: JSON.stringify({ keys: Object.keys(patch) }),
    }).catch(() => {});

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error("[admin/deals/drafts/:id PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Discard a draft (any status — reviewed drafts are just history). */
export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requireDealReviewer();
  if (guard.response) return guard.response;
  try {
    const draft = await getDealDraft(params.id);
    if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    await deleteDealDraft(params.id);
    logAuditEvent({
      adminId: guard.admin.id,
      adminUsername: guard.admin.username,
      action: "deal_draft.delete",
      targetType: "deal_draft",
      targetId: params.id,
      details: JSON.stringify({ clientName: draft.fields.clientName, status: draft.status }),
    }).catch(() => {});
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/deals/drafts/:id DELETE]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
