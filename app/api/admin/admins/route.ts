import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin, readAdmins, insertAdmin, deleteAdmin } from "@/lib/admins";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/** Verify admin session and optionally require super admin. */
async function requireAdmin(superAdminOnly = false) {
  const session = getAdminSession();
  if (!session) return null;
  const admin = await findAdmin(session.adminId);
  if (!admin) return null;
  if (superAdminOnly && !admin.isSuper) return null;
  return admin;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const admins = await readAdmins();
  const safe = admins.map(({ passwordHash, ...rest }) => ({
    ...rest,
    hasPassword: passwordHash !== null,
  }));
  return NextResponse.json({ data: safe });
}

export async function POST(request: Request) {
  const admin = await requireAdmin(true);
  if (!admin) return admin === null ? unauthorized() : forbidden();

  try {
    const body = await request.json();
    const username = String(body.username ?? "").trim().toLowerCase();

    if (!username) {
      return NextResponse.json({ error: "username is required" }, { status: 400 });
    }

    // Check for existing username
    const existing = await readAdmins();
    if (existing.find((a) => a.username === username)) {
      return NextResponse.json({ error: "Username already exists" }, { status: 409 });
    }

    await insertAdmin({ id: username, username, passwordHash: null, isSuper: false });
    return NextResponse.json({ data: { id: username, username, isSuper: false, hasPassword: false } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin(true);
  if (!admin) return unauthorized();

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const deleted = await deleteAdmin(id);
  if (!deleted) {
    return NextResponse.json(
      { error: "Admin not found or cannot delete super admin" },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true });
}
