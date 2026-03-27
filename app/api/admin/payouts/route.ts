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

const MAX_TEXT = 500;
const MAX_NOTES = 2000;
const MAX_DATE = 20;
const MAX_SPLIT_PARTIES = 20;

function trimStr(val: unknown, max: number): string | null {
  if (!val) return null;
  const s = String(val).trim();
  return s ? s.slice(0, max) : null;
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
    const brandName = String(body.brandName ?? "").trim().slice(0, MAX_TEXT);
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

    // Commission split validation
    const commissionSplit = Boolean(body.commissionSplit);
    let splitDetails: Array<{ name: string; pct: number }> = [];
    if (commissionSplit && Array.isArray(body.splitDetails)) {
      splitDetails = body.splitDetails
        .slice(0, MAX_SPLIT_PARTIES)
        .filter((p: unknown) => p && typeof p === "object")
        .map((p: { name?: string; pct?: number }) => ({
          name: String(p.name ?? "").trim().slice(0, MAX_TEXT),
          pct: Number(p.pct ?? 0),
        }))
        .filter((p: { name: string; pct: number }) => p.name);
      if (splitDetails.length < 2) {
        return NextResponse.json(
          { error: "Split requires at least 2 parties" },
          { status: 400 }
        );
      }
    }

    const id = crypto.randomUUID();
    const payout = {
      id,
      payoutMonth,
      payoutYear,
      dateJoined: trimStr(body.dateJoined, MAX_DATE),
      firstDayAdSpend: trimStr(body.firstDayAdSpend, MAX_DATE),
      brandName,
      vertical: trimStr(body.vertical, MAX_TEXT),
      pointOfContact: trimStr(body.pointOfContact, MAX_TEXT),
      service: trimStr(body.service, MAX_TEXT),
      isSigned: Boolean(body.isSigned),
      isPaid: Boolean(body.isPaid),
      addedToSlack: Boolean(body.addedToSlack),
      amountDue,
      amountPaid,
      paymentNotes: trimStr(body.paymentNotes, MAX_NOTES),
      salesRep: trimStr(body.salesRep, MAX_TEXT),
      payDistributed,
      payDistributedDate: trimStr(body.payDistributedDate, MAX_DATE),
      commissionSplit,
      splitDetails,
      referral: trimStr(body.referral, MAX_TEXT),
      referralPct: body.referralPct !== undefined && body.referralPct !== null
        ? Math.max(0, Math.min(100, Math.round(Number(body.referralPct))))
        : null,
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
      changes.dateJoined = trimStr(body.dateJoined, MAX_DATE);
    if (body.firstDayAdSpend !== undefined)
      changes.firstDayAdSpend = trimStr(body.firstDayAdSpend, MAX_DATE);
    if (body.brandName !== undefined) {
      const bn = String(body.brandName).trim().slice(0, MAX_TEXT);
      if (!bn) {
        return NextResponse.json(
          { error: "Brand name cannot be empty" },
          { status: 400 }
        );
      }
      changes.brandName = bn;
    }
    if (body.vertical !== undefined)
      changes.vertical = trimStr(body.vertical, MAX_TEXT);
    if (body.pointOfContact !== undefined)
      changes.pointOfContact = trimStr(body.pointOfContact, MAX_TEXT);
    if (body.service !== undefined)
      changes.service = trimStr(body.service, MAX_TEXT);
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
      changes.paymentNotes = trimStr(body.paymentNotes, MAX_NOTES);
    if (body.salesRep !== undefined)
      changes.salesRep = trimStr(body.salesRep, MAX_TEXT);
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
    if (body.payDistributedDate !== undefined) {
      changes.payDistributedDate = trimStr(body.payDistributedDate, MAX_DATE);
    }
    if (body.commissionSplit !== undefined) {
      changes.commissionSplit = Boolean(body.commissionSplit);
    }
    if (body.splitDetails !== undefined) {
      if (Array.isArray(body.splitDetails)) {
        const parsed = body.splitDetails
          .slice(0, MAX_SPLIT_PARTIES)
          .filter((p: unknown) => p && typeof p === "object")
          .map((p: { name?: string; pct?: number }) => ({
            name: String(p.name ?? "").trim().slice(0, MAX_TEXT),
            pct: Number(p.pct ?? 0),
          }))
          .filter((p: { name: string; pct: number }) => p.name);
        const isSplitEnabled = body.commissionSplit !== undefined
          ? Boolean(body.commissionSplit)
          : payout.commissionSplit;
        if (isSplitEnabled && parsed.length < 2) {
          return NextResponse.json(
            { error: "Split requires at least 2 parties" },
            { status: 400 }
          );
        }
        changes.splitDetails = parsed;
      } else {
        changes.splitDetails = [];
      }
    }
    if (body.referral !== undefined)
      changes.referral = trimStr(body.referral, MAX_TEXT);
    if (body.referralPct !== undefined) {
      changes.referralPct = body.referralPct !== null
        ? Math.max(0, Math.min(100, Math.round(Number(body.referralPct))))
        : null;
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
