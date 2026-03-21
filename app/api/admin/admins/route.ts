export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin, readAdmins, insertAdmin, updateAdmin, deleteAdmin } from "@/lib/admins";
import { logAuditEvent } from "@/lib/auditLog";
import { type PermissionKey, ALL_PERMISSION_KEYS } from "@/lib/permissions";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

/** Sanitize permissions object: only allow known boolean keys. */
function sanitizePermissions(raw: unknown): Partial<Record<PermissionKey, boolean>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: Partial<Record<PermissionKey, boolean>> = {};
  for (const key of ALL_PERMISSION_KEYS) {
    if (key in (raw as Record<string, unknown>)) {
      result[key] = Boolean((raw as Record<string, unknown>)[key]);
    }
  }
  return result;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const admins = await readAdmins();
  const safe = admins.map(({ passwordHash: _, ...rest }) => ({
    ...rest,
    hasPassword: _ !== null,
  }));
  return NextResponse.json({ data: safe });
}

export async function POST(request: Request) {
  const admin = await requireAdmin(true);
  if (!admin) return unauthorized();

  try {
    const body = await request.json();
    const username = String(body.username ?? "").trim().toLowerCase();
    const displayName = body.displayName ? String(body.displayName).trim() : null;
    const email = body.email ? String(body.email).trim() : null;
    const role = body.role ? String(body.role).trim() : "admin";
    const permissions = sanitizePermissions(body.permissions);

    if (!username) {
      return NextResponse.json({ error: "username is required" }, { status: 400 });
    }

    // Check for existing username
    const existing = await readAdmins();
    if (existing.find((a) => a.username === username)) {
      return NextResponse.json({ error: "Username already exists" }, { status: 409 });
    }

    await insertAdmin({
      id: username,
      username,
      passwordHash: null,
      displayName,
      email,
      avatarPath: null,
      role,
      isSuper: false,
      permissions,
    });

    // Audit log
    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "admin.create",
      targetType: "admin",
      targetId: username,
      details: JSON.stringify({ displayName, email, role, permissions }),
    }).catch(() => {});

    return NextResponse.json({
      data: {
        id: username,
        username,
        isSuper: false,
        hasPassword: false,
        displayName,
        email,
        avatarPath: null,
        role,
        permissions,
      },
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin(true);
  if (!admin) return unauthorized();

  try {
    const body = await request.json();
    const id = String(body.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const target = await findAdmin(id);
    if (!target) return NextResponse.json({ error: "Admin not found" }, { status: 404 });

    // Escalation prevention: cannot set is_super via PATCH
    if (body.isSuper !== undefined) {
      return NextResponse.json({ error: "Cannot modify super admin status" }, { status: 403 });
    }

    // Cannot modify super admins (except self)
    if (target.isSuper && target.id !== admin.id) {
      return NextResponse.json({ error: "Cannot modify another super admin" }, { status: 403 });
    }

    const changes: Parameters<typeof updateAdmin>[1] = {};
    if (body.displayName !== undefined) changes.displayName = body.displayName != null ? String(body.displayName).trim() : null;
    if (body.email !== undefined) changes.email = body.email != null ? String(body.email).trim() : null;
    if (body.avatarPath !== undefined) changes.avatarPath = body.avatarPath != null ? String(body.avatarPath) : null;
    if (body.role !== undefined) changes.role = String(body.role).trim();
    if (body.permissions !== undefined) changes.permissions = sanitizePermissions(body.permissions);

    await updateAdmin(id, changes);

    // Determine audit action
    const action = body.permissions !== undefined ? "admin.permissions_changed" : "admin.update";
    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action,
      targetType: "admin",
      targetId: id,
      details: JSON.stringify(changes),
    }).catch(() => {});

    const updated = await findAdmin(id);
    if (!updated) return NextResponse.json({ error: "Admin not found" }, { status: 404 });

    const { passwordHash: _, ...safe } = updated;
    return NextResponse.json({ data: { ...safe, hasPassword: _ !== null } });
  } catch (err) {
    console.error("PATCH /api/admin/admins error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin(true);
  if (!admin) return unauthorized();

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const target = await findAdmin(id);
    const deleted = await deleteAdmin(id);
    if (!deleted) {
      return NextResponse.json(
        { error: "Admin not found or cannot delete super admin" },
        { status: 404 }
      );
    }

    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "admin.delete",
      targetType: "admin",
      targetId: id,
      details: target ? JSON.stringify({ username: target.username }) : undefined,
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
