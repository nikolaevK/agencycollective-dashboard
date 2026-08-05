export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { createRebillInvoice } from "@/lib/clientRebillInvoices";
import { requireClientRouteActor } from "@/lib/api/requireAdmin";

interface RouteContext {
  params: { userId: string };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_LIKE_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?/;

/**
 * Backfill action: register an invoice that was sent OUTSIDE this UI (e.g.
 * before this feature shipped, or through a manual email) into the re-bill
 * lifecycle without re-emailing the PDF or creating a payout row. Once
 * registered, the client moves into the `invoice_sent` state the same way a
 * fresh send would — auto-promotes to `paid` when a payout for the cycle
 * lands, or can be Mark-Unpaid'd.
 *
 * Sits in front of `createRebillInvoice` (which already supersedes any prior
 * active sent for the same user) — same write path as the send route, just
 * without the email + PDF-file plumbing.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  await ensureMigrated();

  // libSQL FK enforcement isn't guaranteed (per the codebase notes), so
  // refuse to create an orphan invoice for a missing client; out-of-scope
  // clients read as not-found.
  const guard = await requireClientRouteActor(params.userId);
  if (guard.response) return guard.response;

  let body: {
    invoiceNumber?: unknown;
    cycleAnchor?: unknown;
    amountCents?: unknown;
    sentAt?: unknown;
    recipientEmail?: unknown;
    payoutDocumentId?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // invoiceNumber — required, sanitised the same way as the send route.
  const rawInvoice =
    typeof body.invoiceNumber === "string" ? body.invoiceNumber.trim() : "";
  const invoiceNumber =
    rawInvoice.replace(/[\r\n\x00-\x1f]/g, "").slice(0, 100);
  if (!invoiceNumber)
    return NextResponse.json(
      { error: "invoiceNumber is required" },
      { status: 400 }
    );

  // cycleAnchor — required, must be a REAL calendar date in yyyy-mm-dd.
  // Drives the schedule status, so a malformed value would silently mis-group
  // the row AND prevent the auto-paid promotion from ever matching (the
  // schedule produces real dates via toIsoDate(); "9999-99-99" or "2026-02-30"
  // would pass a regex check but never equal any nextRebillAt). Round-trip
  // through Date to catch overflow/impossible months without re-implementing
  // calendar math.
  const cycleAnchor =
    typeof body.cycleAnchor === "string" ? body.cycleAnchor.trim() : "";
  if (!DATE_RE.test(cycleAnchor))
    return NextResponse.json(
      { error: "cycleAnchor must be yyyy-mm-dd" },
      { status: 400 }
    );
  const cycleProbe = new Date(`${cycleAnchor}T00:00:00Z`);
  if (
    isNaN(cycleProbe.getTime()) ||
    cycleProbe.toISOString().slice(0, 10) !== cycleAnchor
  )
    return NextResponse.json(
      { error: "cycleAnchor is not a real calendar date" },
      { status: 400 }
    );

  // amountCents — non-negative integer, clamped at $10M (matches send route).
  const rawAmount = Number(body.amountCents);
  if (!Number.isFinite(rawAmount) || rawAmount < 0)
    return NextResponse.json(
      { error: "amountCents must be a non-negative number" },
      { status: 400 }
    );
  const amountCents = Math.min(Math.round(rawAmount), 1_000_000_000);

  // sentAt — optional. Accept yyyy-mm-dd OR a full ISO timestamp; if a bare
  // date comes in, anchor it to noon UTC so local-time month grouping doesn't
  // shift either way at the boundary.
  let sentAt: string | undefined;
  if (body.sentAt !== undefined && body.sentAt !== null && body.sentAt !== "") {
    if (typeof body.sentAt !== "string" || !ISO_LIKE_RE.test(body.sentAt))
      return NextResponse.json(
        { error: "sentAt must be ISO-like (yyyy-mm-dd or full timestamp)" },
        { status: 400 }
      );
    if (DATE_RE.test(body.sentAt)) {
      sentAt = `${body.sentAt}T12:00:00.000Z`;
    } else {
      const d = new Date(body.sentAt);
      if (isNaN(d.getTime()))
        return NextResponse.json({ error: "sentAt is not a valid date" }, { status: 400 });
      sentAt = d.toISOString();
    }
  }

  // recipientEmail — optional. Reject malformed strings; an empty/missing
  // value is fine (the panel just won't show one).
  let recipientEmail: string | null = null;
  if (body.recipientEmail !== undefined && body.recipientEmail !== null && body.recipientEmail !== "") {
    if (typeof body.recipientEmail !== "string")
      return NextResponse.json({ error: "Invalid recipientEmail" }, { status: 400 });
    const v = body.recipientEmail.trim();
    if (v && (!EMAIL_RE.test(v) || v.length > 254))
      return NextResponse.json({ error: "Invalid recipientEmail" }, { status: 400 });
    recipientEmail = v || null;
  }

  // payoutDocumentId — optional opaque link; we trust the body since this is
  // admin-only and the column is just a back-reference (no FK enforcement).
  const payoutDocumentId =
    typeof body.payoutDocumentId === "string" && body.payoutDocumentId
      ? body.payoutDocumentId
      : null;

  try {
    const invoice = await createRebillInvoice({
      userId: params.userId,
      invoiceNumber,
      payoutDocumentId,
      cycleAnchor,
      amountCents,
      recipientEmail,
      sentByAdminId: guard.actor.admin.id,
      sentAt,
    });
    return NextResponse.json({ data: invoice });
  } catch (err) {
    console.error("[rebill-invoice/register]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
