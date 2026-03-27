export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import {
  readPayoutsByMonth,
  findPayout,
  insertPayout,
  updatePayout,
  deletePayout,
} from "@/lib/payouts";
import type { PayDistributed } from "@/lib/payouts";
import { logAuditEvent } from "@/lib/auditLog";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

async function requireAdmin() {
  const session = getAdminSession();
  if (!session) return null;
  const admin = await findAdmin(session.adminId);
  if (!admin) return null;
  return admin;
}

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const month = Number(searchParams.get("month") || now.getMonth() + 1);
  const year = Number(searchParams.get("year") || now.getFullYear());

  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Invalid month or year" }, { status: 400 });
  }

  const salesRep = searchParams.get("salesRep")?.toLowerCase();
  const search = searchParams.get("search")?.toLowerCase();

  let payouts = await readPayoutsByMonth(month, year);

  if (salesRep) {
    payouts = payouts.filter(
      (p) => p.salesRep && p.salesRep.toLowerCase().includes(salesRep)
    );
  }
  if (search) {
    payouts = payouts.filter((p) =>
      p.brandName.toLowerCase().includes(search)
    );
  }

  return NextResponse.json({ data: payouts });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  try {
    const body = await request.json();
    const brandName = String(body.brandName ?? "").trim();
    if (!brandName) {
      return NextResponse.json(
        { error: "Brand name is required" },
        { status: 400 }
      );
    }

    const now = new Date();
    const payoutMonth = Number(body.payoutMonth || now.getMonth() + 1);
    const payoutYear = Number(body.payoutYear || now.getFullYear());

    if (!Number.isInteger(payoutMonth) || payoutMonth < 1 || payoutMonth > 12 || !Number.isInteger(payoutYear) || payoutYear < 2000 || payoutYear > 2100) {
      return NextResponse.json({ error: "Invalid month or year" }, { status: 400 });
    }

    let amountDue = 0;
    if (body.amountDue !== undefined) {
      const ad = Number(body.amountDue);
      if (!Number.isFinite(ad) || ad < 0 || ad > 10_000_000) {
        return NextResponse.json(
          { error: "Invalid amount due" },
          { status: 400 }
        );
      }
      amountDue = Math.round(ad * 100);
    }

    let amountPaid = 0;
    if (body.amountPaid !== undefined) {
      const av = Number(body.amountPaid);
      if (!Number.isFinite(av) || av < 0 || av > 10_000_000) {
        return NextResponse.json(
          { error: "Invalid amount paid" },
          { status: 400 }
        );
      }
      amountPaid = Math.round(av * 100);
    }

    const validDistributed = ["Yes", "No", "Hold Til Full Pay"];
    const payDistributed =
      body.payDistributed && validDistributed.includes(body.payDistributed)
        ? (body.payDistributed as PayDistributed)
        : "No";

    const id = crypto.randomUUID();
    const payout = {
      id,
      payoutMonth,
      payoutYear,
      dateJoined: body.dateJoined ? String(body.dateJoined).trim() : null,
      firstDayAdSpend: body.firstDayAdSpend
        ? String(body.firstDayAdSpend).trim()
        : null,
      brandName,
      vertical: body.vertical ? String(body.vertical).trim() : null,
      pointOfContact: body.pointOfContact
        ? String(body.pointOfContact).trim()
        : null,
      service: body.service ? String(body.service).trim() : null,
      isSigned: Boolean(body.isSigned),
      isPaid: Boolean(body.isPaid),
      addedToSlack: Boolean(body.addedToSlack),
      amountDue,
      amountPaid,
      paymentNotes: body.paymentNotes
        ? String(body.paymentNotes).trim()
        : null,
      salesRep: body.salesRep ? String(body.salesRep).trim() : null,
      payDistributed,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await insertPayout(payout);

    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "payout.create",
      targetType: "payout",
      targetId: id,
      details: JSON.stringify({ brandName, amountPaid }),
    }).catch(() => {});

    return NextResponse.json({ data: payout });
  } catch (err) {
    console.error("[admin/payouts POST]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  try {
    const body = await request.json();
    const id = String(body.id ?? "").trim();
    if (!id)
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );

    const payout = await findPayout(id);
    if (!payout)
      return NextResponse.json(
        { error: "Payout not found" },
        { status: 404 }
      );

    const changes: Parameters<typeof updatePayout>[1] = {};

    if (body.dateJoined !== undefined)
      changes.dateJoined = body.dateJoined
        ? String(body.dateJoined).trim()
        : null;
    if (body.firstDayAdSpend !== undefined)
      changes.firstDayAdSpend = body.firstDayAdSpend
        ? String(body.firstDayAdSpend).trim()
        : null;
    if (body.brandName !== undefined)
      changes.brandName = String(body.brandName).trim();
    if (body.vertical !== undefined)
      changes.vertical = body.vertical
        ? String(body.vertical).trim()
        : null;
    if (body.pointOfContact !== undefined)
      changes.pointOfContact = body.pointOfContact
        ? String(body.pointOfContact).trim()
        : null;
    if (body.service !== undefined)
      changes.service = body.service ? String(body.service).trim() : null;
    if (body.isSigned !== undefined) changes.isSigned = Boolean(body.isSigned);
    if (body.isPaid !== undefined) changes.isPaid = Boolean(body.isPaid);
    if (body.addedToSlack !== undefined)
      changes.addedToSlack = Boolean(body.addedToSlack);
    if (body.amountDue !== undefined) {
      const ad = Number(body.amountDue);
      if (!Number.isFinite(ad) || ad < 0 || ad > 10_000_000) {
        return NextResponse.json(
          { error: "Invalid amount due" },
          { status: 400 }
        );
      }
      changes.amountDue = Math.round(ad * 100);
    }
    if (body.amountPaid !== undefined) {
      const av = Number(body.amountPaid);
      if (!Number.isFinite(av) || av < 0 || av > 10_000_000) {
        return NextResponse.json(
          { error: "Invalid amount paid" },
          { status: 400 }
        );
      }
      changes.amountPaid = Math.round(av * 100);
    }
    if (body.paymentNotes !== undefined)
      changes.paymentNotes = body.paymentNotes
        ? String(body.paymentNotes).trim()
        : null;
    if (body.salesRep !== undefined)
      changes.salesRep = body.salesRep
        ? String(body.salesRep).trim()
        : null;
    if (body.payDistributed !== undefined) {
      const valid = ["Yes", "No", "Hold Til Full Pay"];
      if (!valid.includes(body.payDistributed)) {
        return NextResponse.json(
          { error: "Invalid pay_distributed value" },
          { status: 400 }
        );
      }
      changes.payDistributed = body.payDistributed as PayDistributed;
    }

    await updatePayout(id, changes);

    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "payout.update",
      targetType: "payout",
      targetId: id,
      details: JSON.stringify(changes),
    }).catch(() => {});

    const updated = await findPayout(id);
    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error("[admin/payouts PATCH]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id)
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );

    const payout = await findPayout(id);
    const deleted = await deletePayout(id);
    if (!deleted)
      return NextResponse.json(
        { error: "Payout not found" },
        { status: 404 }
      );

    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "payout.delete",
      targetType: "payout",
      targetId: id,
      details: payout
        ? JSON.stringify({
            brandName: payout.brandName,
            amountPaid: payout.amountPaid,
          })
        : undefined,
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/payouts DELETE]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
