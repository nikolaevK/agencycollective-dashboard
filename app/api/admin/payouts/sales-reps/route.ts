export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import {
  readSalesRepOptions,
  addSalesRepOption,
  removeSalesRepOption,
} from "@/lib/payouts";
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

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const options = await readSalesRepOptions();
  return NextResponse.json({ data: options });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    if (!name || name.length > 200) {
      return NextResponse.json(
        { error: "Valid name is required" },
        { status: 400 }
      );
    }

    await addSalesRepOption(name);

    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "sales_rep_option.create",
      targetType: "sales_rep_option",
      targetId: name,
      details: JSON.stringify({ name }),
    }).catch(() => {});

    const options = await readSalesRepOptions();
    return NextResponse.json({ data: options });
  } catch (err) {
    console.error("[admin/payouts/sales-reps POST]", err);
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
    const name = searchParams.get("name");
    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    await removeSalesRepOption(name);

    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "sales_rep_option.delete",
      targetType: "sales_rep_option",
      targetId: name,
      details: JSON.stringify({ name }),
    }).catch(() => {});

    const options = await readSalesRepOptions();
    return NextResponse.json({ data: options });
  } catch (err) {
    console.error("[admin/payouts/sales-reps DELETE]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
