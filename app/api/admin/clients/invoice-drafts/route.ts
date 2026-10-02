export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import {
  requireDirectoryActor,
  findClientInScope,
  findAdAccountInScope,
} from "@/lib/api/requireAdmin";
import { inWorkspaceScope } from "@/lib/workspaces";
import {
  createInvoiceDraft,
  listVisibleInvoiceDrafts,
  INVOICE_DRAFT_KINDS,
  INVOICE_DRAFT_STATUSES,
  type InvoiceDraftKind,
  type InvoiceDraftStatus,
} from "@/lib/invoiceDrafts";
import { parseInvoiceDraftPatch } from "@/lib/invoiceDraftInput";
import { logAuditEvent } from "@/lib/auditLog";

/**
 * Invoice drafts awaiting review (client re-bill + ad-account), scoped to the
 * actor's workspaces — a draft whose client/account is outside the actor's
 * books is invisible. Filters: `status` (default pending | sent | rejected |
 * all), `kind`, `userId`, `adAccountId`. Rows carry clientName/accountName.
 */
export async function GET(request: Request) {
  const actor = await requireDirectoryActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureMigrated();

  const sp = new URL(request.url).searchParams;
  const rawStatus = sp.get("status") ?? "pending";
  const status = INVOICE_DRAFT_STATUSES.includes(rawStatus as InvoiceDraftStatus)
    ? (rawStatus as InvoiceDraftStatus)
    : undefined;
  if (!status && rawStatus !== "all") return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  const rawKind = sp.get("kind");
  if (rawKind && !INVOICE_DRAFT_KINDS.includes(rawKind as InvoiceDraftKind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  try {
    const { items } = await listVisibleInvoiceDrafts(
      {
        status,
        kind: (rawKind as InvoiceDraftKind | null) ?? undefined,
        ownerUserId: sp.get("userId") ?? undefined,
        adAccountId: sp.get("adAccountId") ?? undefined,
      },
      (t) => inWorkspaceScope(actor.scope, t.workspace),
      { limit: 300, offset: 0 }
    );
    return NextResponse.json({ data: items });
  } catch (err) {
    console.error("[admin/clients/invoice-drafts GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * "Save draft" from a drawer: `{ kind, userId | adAccountId, invoiceData,
 * recipientEmail?, ccEmails?, paymentType?, options?, note? }`.
 */
export async function POST(request: Request) {
  const actor = await requireDirectoryActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureMigrated();

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const kind = body.kind as InvoiceDraftKind;
    if (!INVOICE_DRAFT_KINDS.includes(kind)) return NextResponse.json({ error: "Invalid kind" }, { status: 400 });

    let userId: string | null = null;
    let adAccountId: string | null = null;
    if (kind === "client_rebill") {
      const user = await findClientInScope(actor.scope, String(body.userId ?? ""));
      if (!user) return NextResponse.json({ error: "Client not found" }, { status: 404 });
      userId = user.id;
    } else {
      const account = await findAdAccountInScope(actor.scope, String(body.adAccountId ?? ""));
      if (!account) return NextResponse.json({ error: "Ad account not found" }, { status: 404 });
      adAccountId = account.id;
      userId = account.userId;
    }

    if (body.invoiceData === undefined) return NextResponse.json({ error: "invoiceData is required" }, { status: 400 });
    const parsed = parseInvoiceDraftPatch(body, { allowInvoiceData: true });
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const p = parsed.value;

    const draft = await createInvoiceDraft({
      kind,
      userId,
      adAccountId,
      invoiceData: p.invoiceData!,
      recipientEmail: p.recipientEmail ?? (p.invoiceData!.receiver.email || null),
      ccEmails: p.ccEmails ?? [],
      paymentType: p.paymentType ?? "local",
      options: p.options ?? {},
      note: p.note ?? null,
      source: "dashboard",
      createdBy: actor.admin.id,
      createdByName: actor.admin.username,
    });

    logAuditEvent({
      adminId: actor.admin.id,
      adminUsername: actor.admin.username,
      action: "invoice_draft.create",
      targetType: "invoice_draft",
      targetId: draft.id,
      details: JSON.stringify({ kind, userId, adAccountId, amountCents: draft.amountCents }),
    }).catch(() => {});

    return NextResponse.json({ data: draft }, { status: 201 });
  } catch (err) {
    console.error("[admin/clients/invoice-drafts POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
