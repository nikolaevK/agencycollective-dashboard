export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { requireDirectoryActor } from "@/lib/api/requireAdmin";
import { loadScopedInvoiceDraft } from "@/lib/api/invoiceDraftScope";
import { updateInvoiceDraft, deleteInvoiceDraft, invoiceDraftConflictMessage } from "@/lib/invoiceDrafts";
import { parseInvoiceDraftPatch } from "@/lib/invoiceDraftInput";
import { logAuditEvent } from "@/lib/auditLog";

interface Ctx {
  params: { id: string };
}

export async function GET(_req: Request, { params }: Ctx) {
  const actor = await requireDirectoryActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureMigrated();
  try {
    const found = await loadScopedInvoiceDraft(actor, params.id);
    if (!found) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    return NextResponse.json({
      data: { ...found.draft, clientName: found.clientName, accountName: found.accountName },
    });
  } catch (err) {
    console.error("[admin/clients/invoice-drafts/:id GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Update a pending draft from the drawer ("Save draft" again). */
export async function PATCH(request: Request, { params }: Ctx) {
  const actor = await requireDirectoryActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureMigrated();
  try {
    const found = await loadScopedInvoiceDraft(actor, params.id);
    if (!found) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    if (found.draft.status !== "pending") {
      return NextResponse.json({ error: `Draft is already ${found.draft.status}` }, { status: 409 });
    }
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    const parsed = parseInvoiceDraftPatch(body, { allowInvoiceData: true });
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const updated = await updateInvoiceDraft(params.id, parsed.value);
    if (!updated) return NextResponse.json({ error: await invoiceDraftConflictMessage(params.id) }, { status: 409 });

    logAuditEvent({
      adminId: actor.admin.id,
      adminUsername: actor.admin.username,
      action: "invoice_draft.update",
      targetType: "invoice_draft",
      targetId: params.id,
      details: JSON.stringify({ keys: Object.keys(parsed.value), amountCents: updated.amountCents }),
    }).catch(() => {});

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error("[admin/clients/invoice-drafts/:id PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Discard a draft (any status — reviewed drafts are just history). */
export async function DELETE(_req: Request, { params }: Ctx) {
  const actor = await requireDirectoryActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureMigrated();
  try {
    const found = await loadScopedInvoiceDraft(actor, params.id);
    if (!found) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    await deleteInvoiceDraft(params.id);
    logAuditEvent({
      adminId: actor.admin.id,
      adminUsername: actor.admin.username,
      action: "invoice_draft.delete",
      targetType: "invoice_draft",
      targetId: params.id,
      details: JSON.stringify({ kind: found.draft.kind, status: found.draft.status }),
    }).catch(() => {});
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/clients/invoice-drafts/:id DELETE]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
