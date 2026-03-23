export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { readDeals, findDeal, updateDeal, deleteDeal } from "@/lib/deals";
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
  const closerId = searchParams.get("closerId");
  const status = searchParams.get("status");
  const search = searchParams.get("search")?.toLowerCase();

  let deals = await readDeals();

  if (closerId) {
    deals = deals.filter((d) => d.closerId === closerId);
  }
  if (status && status !== "all") {
    deals = deals.filter((d) => d.status === status);
  }
  if (search) {
    deals = deals.filter((d) =>
      d.clientName.toLowerCase().includes(search)
    );
  }

  return NextResponse.json({ data: deals });
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  try {
    const body = await request.json();
    const id = String(body.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const deal = await findDeal(id);
    if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

    const changes: Parameters<typeof updateDeal>[1] = {};

    if (body.clientName !== undefined) changes.clientName = String(body.clientName).trim();
    if (body.dealValue !== undefined) changes.dealValue = Math.round(Number(body.dealValue) * 100);
    if (body.serviceCategory !== undefined) changes.serviceCategory = body.serviceCategory ? String(body.serviceCategory).trim() : null;
    if (body.closingDate !== undefined) changes.closingDate = body.closingDate ? String(body.closingDate).trim() : null;
    if (body.status !== undefined) changes.status = String(body.status).trim() as "closed" | "pending_signature" | "in_progress";
    if (body.notes !== undefined) changes.notes = body.notes ? String(body.notes).trim() : null;
    if (body.clientUserId !== undefined) changes.clientUserId = body.clientUserId ? String(body.clientUserId).trim() : null;

    await updateDeal(id, changes);

    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "deal.update",
      targetType: "deal",
      targetId: id,
      details: JSON.stringify(changes),
    }).catch(() => {});

    const updated = await findDeal(id);
    return NextResponse.json({ data: updated });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const deal = await findDeal(id);
    const deleted = await deleteDeal(id);
    if (!deleted) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "deal.delete",
      targetType: "deal",
      targetId: id,
      details: deal ? JSON.stringify({ clientName: deal.clientName, dealValue: deal.dealValue }) : undefined,
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
