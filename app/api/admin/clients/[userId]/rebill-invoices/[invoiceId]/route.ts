export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import {
  findRebillInvoice,
  getSentInvoicesForUser,
  reconcileInvoicesForUser,
} from "@/lib/clientRebillInvoices";
import {
  applyManualInvoiceUpdate,
  manualUpdateConflict,
} from "@/lib/invoiceManualOverride";
import { parseManualInvoicePatch } from "@/lib/api/invoiceManualPatch";
import { requireClientRouteActor } from "@/lib/api/requireAdmin";
import {
  qualifyingMonthsForUser,
  payoutBrandBasisForUser,
} from "@/lib/clientDirectory";
import { isExternalScope } from "@/lib/workspaces";
import { findPayout, payoutMatchesBrand } from "@/lib/payouts";
import { logAuditEvent } from "@/lib/auditLog";

interface RouteContext {
  params: { userId: string; invoiceId: string };
}

/**
 * Manual override for one client re-bill invoice: set paid/unpaid/sent by
 * hand, link it to a specific payout row, re-anchor its billing cycle, or
 * hand it back to the automation (`resync`). Every manual status locks the
 * row against read-time auto-promotion until the next resync.
 */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  await ensureMigrated();

  const guard = await requireClientRouteActor(params.userId);
  if (guard.response) return guard.response;
  const { actor, user } = guard;

  const invoice = await findRebillInvoice(params.invoiceId);
  if (!invoice || invoice.userId !== params.userId)
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const parsed = parseManualInvoicePatch(await req.json().catch(() => null));
  if (!parsed.ok)
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  const body = parsed.value;

  let paidPayout: { id: string; month: number; year: number } | null | undefined;
  if (body.paidPayoutId !== undefined) {
    if (body.paidPayoutId === null) {
      paidPayout = null;
    } else {
      if (isExternalScope(actor.scope))
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const payout = await findPayout(body.paidPayoutId);
      if (!payout)
        return NextResponse.json({ error: "Payout not found" }, { status: 404 });
      const brand = payoutBrandBasisForUser(user);
      if (
        !brand ||
        !payoutMatchesBrand(payout.brandName, brand, user.workspace !== "main")
      )
        return NextResponse.json(
          { error: "Payout does not belong to this client's brand" },
          { status: 400 }
        );
      paidPayout = { id: payout.id, month: payout.payoutMonth, year: payout.payoutYear };
    }
  }

  const conflict = manualUpdateConflict(invoice.status, {
    status: body.status,
    resync: body.resync,
    paidPayout,
  });
  if (conflict) return NextResponse.json({ error: conflict }, { status: 409 });

  try {
    const ok = await applyManualInvoiceUpdate("client_rebill_invoices", invoice.id, {
      adminId: actor.admin.id,
      status: body.status,
      cycleAnchor: body.cycleAnchor,
      paidPayout,
      note: body.note,
      resync: body.resync,
      // Only write if the row still has the status pre-flighted above — a
      // concurrent re-send may have superseded it in between.
      expectedStatus: invoice.status,
    });
    if (!ok)
      return NextResponse.json(
        { error: "Invoice changed since you opened it — refresh and try again" },
        { status: 409 }
      );

    let updated = await findRebillInvoice(invoice.id);

    // After a resync the row is `sent` + unlocked — re-run the normal payout
    // reconciliation right away so a matching payment settles it at once.
    if (body.resync && updated) {
      try {
        // Alongside the client's other open invoices, so one payout month
        // can't settle this row AND another one (allocateAutoPaid).
        const reconciled = await reconcileInvoicesForUser(
          await getSentInvoicesForUser(user.id),
          await qualifyingMonthsForUser(user)
        );
        updated = reconciled.find((i) => i.id === updated!.id) ?? updated;
      } catch {
        // best-effort — the directory build reconciles on next read
      }
    }

    logAuditEvent({
      adminId: actor.admin.id,
      adminUsername: actor.admin.username,
      action: "client_rebill_invoice.manual_override",
      targetType: "client_rebill_invoice",
      targetId: invoice.id,
      details: JSON.stringify({
        userId: params.userId,
        status: body.status ?? null,
        cycleAnchor: body.cycleAnchor ?? null,
        paidPayoutId: body.paidPayoutId ?? null,
        resync: body.resync ?? false,
      }),
    }).catch(() => {});

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error("[rebill-invoice/manual]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
