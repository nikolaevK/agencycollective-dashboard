export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { logAuditEvent } from "@/lib/auditLog";
import {
  findApiToken,
  updateApiToken,
  revokeApiToken,
  deleteApiToken,
  UpdateApiTokenInput,
} from "@/lib/apiTokens";
import { sanitizeScopes, sanitizeResourceIds } from "@/lib/apiScopes";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/** Verify admin session + the `apitokens` permission (supers bypass). */
async function requireTokenAdmin() {
  const session = getAdminSession();
  if (!session) return null;
  const admin = await findAdmin(session.adminId);
  if (!admin) return null;
  if (!admin.isSuper && !admin.permissions.apitokens) return null;
  return admin;
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const admin = await requireTokenAdmin();
  if (!admin) return unauthorized();

  const token = await findApiToken(params.id);
  if (!token) return NextResponse.json({ error: "Token not found" }, { status: 404 });
  return NextResponse.json({ data: token });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const admin = await requireTokenAdmin();
  if (!admin) return unauthorized();

  try {
    const existing = await findApiToken(params.id);
    if (!existing) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    const body = await request.json();
    const changes: UpdateApiTokenInput = {};
    if (body.name !== undefined) {
      const name = String(body.name ?? "").trim();
      if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
      if (name.length > 100) {
        return NextResponse.json({ error: "name is too long (max 100)" }, { status: 400 });
      }
      changes.name = name;
    }
    if (body.scopes !== undefined) {
      const scopes = sanitizeScopes(body.scopes);
      if (Object.keys(scopes).length === 0) {
        return NextResponse.json(
          { error: "At least one scope is required" },
          { status: 400 }
        );
      }
      changes.scopes = scopes;
    }
    if (body.clientIds !== undefined) changes.clientIds = sanitizeResourceIds(body.clientIds);
    if (body.closerIds !== undefined) changes.closerIds = sanitizeResourceIds(body.closerIds);
    if (body.workspaces !== undefined) {
      // Array of registry slugs; empty/none → null = all workspaces.
      if (body.workspaces === null || (Array.isArray(body.workspaces) && body.workspaces.length === 0)) {
        changes.workspaces = null;
      } else if (Array.isArray(body.workspaces)) {
        const { listWorkspaceValues } = await import("@/lib/workspaces");
        const valid = await listWorkspaceValues();
        const list: string[] = [
          ...new Set(
            (body.workspaces as unknown[])
              .map((v) => String(v).trim())
              .filter((v) => valid.has(v))
          ),
        ];
        changes.workspaces = list.length > 0 ? list : null;
      }
    }
    if (body.expiresAt !== undefined) {
      const expiresAt =
        body.expiresAt != null && String(body.expiresAt).trim() !== ""
          ? String(body.expiresAt).trim()
          : null;
      if (expiresAt && !/^\d{4}-\d{2}-\d{2}/.test(expiresAt)) {
        return NextResponse.json(
          { error: "expiresAt must be an ISO date (yyyy-mm-dd)" },
          { status: 400 }
        );
      }
      changes.expiresAt = expiresAt;
    }

    const updated = await updateApiToken(params.id, changes);
    if (!updated) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "api_token.update",
      targetType: "api_token",
      targetId: params.id,
      details: JSON.stringify(changes),
    }).catch(() => {});

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error("PATCH /api/admin/api-tokens/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Revoke by default; `?hard=1` permanently deletes the row + usage. */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const admin = await requireTokenAdmin();
  if (!admin) return unauthorized();

  try {
    const { searchParams } = new URL(request.url);
    const hard = searchParams.get("hard") === "1";

    const target = await findApiToken(params.id);
    if (!target) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    if (hard) {
      await deleteApiToken(params.id);
    } else {
      const revoked = await revokeApiToken(params.id);
      if (!revoked) {
        return NextResponse.json({ error: "Token is already revoked" }, { status: 409 });
      }
    }

    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: hard ? "api_token.delete" : "api_token.revoke",
      targetType: "api_token",
      targetId: params.id,
      details: JSON.stringify({ name: target.name, prefix: target.prefix }),
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/api-tokens/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
