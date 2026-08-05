export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin, readAdmins } from "@/lib/admins";
import { readUsers } from "@/lib/users";
import { ensureMigrated } from "@/lib/db";
import { logAuditEvent } from "@/lib/auditLog";
import {
  listWorkspaces,
  addWorkspace,
  renameWorkspace,
  removeWorkspace,
  WorkspaceRegistryError,
  DEFAULT_WORKSPACE,
} from "@/lib/workspaces";

/**
 * Workspace (book) registry management. Sits under /api/admin/admins so the
 * middleware `admin` permission gates it; in-route we additionally require a
 * privileged actor (super OR admin perm) — the same bar that grants unscoped
 * visibility of every book.
 */
async function requirePrivileged() {
  const session = getAdminSession();
  if (!session) return null;
  const admin = await findAdmin(session.adminId);
  if (!admin) return null;
  if (!admin.isSuper && !admin.permissions.admin) return null;
  return admin;
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/** All workspaces + per-workspace client/admin counts (for the manage UI). */
export async function GET() {
  const admin = await requirePrivileged();
  if (!admin) return unauthorized();

  await ensureMigrated();

  const [workspaces, users, admins] = await Promise.all([
    listWorkspaces(),
    readUsers(),
    readAdmins(),
  ]);

  const data = workspaces.map((w) => ({
    ...w,
    clientCount: users.filter((u) => u.workspace === w.value).length,
    adminCount: admins.filter((a) => (a.workspaces ?? [DEFAULT_WORKSPACE]).includes(w.value))
      .length,
    builtIn: w.value === DEFAULT_WORKSPACE,
  }));

  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const admin = await requirePrivileged();
  if (!admin) return unauthorized();

  await ensureMigrated();

  try {
    const body = (await request.json()) as { label?: unknown };
    const created = await addWorkspace(String(body.label ?? ""));

    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "workspace.create",
      targetType: "workspace",
      targetId: created.value,
      details: JSON.stringify(created),
    }).catch(() => {});

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err) {
    if (err instanceof WorkspaceRegistryError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[workspaces] POST failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const admin = await requirePrivileged();
  if (!admin) return unauthorized();

  await ensureMigrated();

  try {
    const body = (await request.json()) as { value?: unknown; label?: unknown };
    const value = String(body.value ?? "").trim();
    if (!value || value === DEFAULT_WORKSPACE) {
      return NextResponse.json({ error: "Invalid workspace" }, { status: 400 });
    }
    await renameWorkspace(value, String(body.label ?? ""));

    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "workspace.rename",
      targetType: "workspace",
      targetId: value,
      details: JSON.stringify({ label: body.label }),
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof WorkspaceRegistryError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[workspaces] PATCH failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const admin = await requirePrivileged();
  if (!admin) return unauthorized();

  await ensureMigrated();

  try {
    const { searchParams } = new URL(request.url);
    const value = String(searchParams.get("value") ?? "").trim();
    if (!value || value === DEFAULT_WORKSPACE) {
      return NextResponse.json({ error: "Invalid workspace" }, { status: 400 });
    }

    // Refuse to remove a book that still holds clients OR admins. Orphaned
    // admin scopes are worse than orphaned clients: the slug fails closed at
    // first (they see nothing), but a later Add/Edit-Admin save would
    // sanitize the dead slug away → NULL → the partner admin silently falls
    // back to the MAIN book. Unassign the admins first.
    const [users, admins] = await Promise.all([readUsers(), readAdmins()]);
    const stillAssigned = users.filter((u) => u.workspace === value).length;
    if (stillAssigned > 0) {
      return NextResponse.json(
        {
          error: `${stillAssigned} client(s) still assigned to this workspace — move them first`,
        },
        { status: 409 }
      );
    }
    const adminHolders = admins.filter((a) => (a.workspaces ?? []).includes(value)).length;
    if (adminHolders > 0) {
      return NextResponse.json(
        {
          error: `${adminHolders} admin(s) still assigned to this workspace — unassign them first`,
        },
        { status: 409 }
      );
    }

    await removeWorkspace(value);

    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "workspace.delete",
      targetType: "workspace",
      targetId: value,
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof WorkspaceRegistryError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[workspaces] DELETE failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
