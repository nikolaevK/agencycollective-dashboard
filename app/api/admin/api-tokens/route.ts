export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { logAuditEvent } from "@/lib/auditLog";
import { createApiToken, listApiTokens } from "@/lib/apiTokens";
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

export async function GET() {
  const admin = await requireTokenAdmin();
  if (!admin) return unauthorized();

  const tokens = await listApiTokens();
  return NextResponse.json({ data: tokens });
}

export async function POST(request: Request) {
  const admin = await requireTokenAdmin();
  if (!admin) return unauthorized();

  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (name.length > 100) {
      return NextResponse.json({ error: "name is too long (max 100)" }, { status: 400 });
    }

    const scopes = sanitizeScopes(body.scopes);
    if (Object.keys(scopes).length === 0) {
      return NextResponse.json(
        { error: "At least one scope is required" },
        { status: 400 }
      );
    }

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

    const { record, token } = await createApiToken({
      name,
      scopes,
      clientIds: sanitizeResourceIds(body.clientIds),
      closerIds: sanitizeResourceIds(body.closerIds),
      expiresAt,
      createdBy: admin.id,
      createdByName: admin.displayName ?? admin.username,
    });

    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "api_token.create",
      targetType: "api_token",
      targetId: record.id,
      details: JSON.stringify({
        name,
        prefix: record.prefix,
        scopes,
        clientIds: record.clientIds,
        closerIds: record.closerIds,
        expiresAt,
      }),
    }).catch(() => {});

    // `token` is the plaintext secret — shown exactly once, never re-fetchable.
    return NextResponse.json({ data: { record, token } }, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/api-tokens error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
