export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { readClosers, findCloser, deleteCloser, updateCloser } from "@/lib/closers";
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
  const statusFilter = searchParams.get("status");
  const search = searchParams.get("search")?.toLowerCase();

  let closers = await readClosers();

  if (statusFilter && statusFilter !== "all") {
    closers = closers.filter((c) => c.status === statusFilter);
  }

  if (search) {
    closers = closers.filter(
      (c) =>
        c.displayName.toLowerCase().includes(search) ||
        c.email.toLowerCase().includes(search) ||
        c.role.toLowerCase().includes(search)
    );
  }

  const safe = closers.map(({ passwordHash: _, ...rest }) => ({
    ...rest,
    hasPassword: _ !== null,
  }));

  return NextResponse.json({ data: safe });
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  try {
    const body = await request.json();
    const { id, status } = body;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    if (status !== "active" && status !== "inactive") {
      return NextResponse.json({ error: "status must be active or inactive" }, { status: 400 });
    }

    const target = await findCloser(id);
    if (!target) return NextResponse.json({ error: "Closer not found" }, { status: 404 });

    await updateCloser(id, { status });

    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "closer.update",
      targetType: "closer",
      targetId: id,
      details: JSON.stringify({ displayName: target.displayName, status }),
    }).catch(() => {});

    return NextResponse.json({ ok: true });
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

    const target = await findCloser(id);
    const deleted = await deleteCloser(id);
    if (!deleted) {
      return NextResponse.json({ error: "Closer not found" }, { status: 404 });
    }

    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "closer.delete",
      targetType: "closer",
      targetId: id,
      details: target ? JSON.stringify({ displayName: target.displayName, email: target.email }) : undefined,
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
