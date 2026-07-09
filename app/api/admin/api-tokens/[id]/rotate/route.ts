export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { logAuditEvent } from "@/lib/auditLog";
import { rotateApiToken } from "@/lib/apiTokens";

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

/** Mint a new secret on the same row — scopes and usage history preserved. */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const admin = await requireTokenAdmin();
  if (!admin) return unauthorized();

  try {
    const rotated = await rotateApiToken(params.id);
    if (!rotated) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "api_token.rotate",
      targetType: "api_token",
      targetId: params.id,
      details: JSON.stringify({ name: rotated.record.name, prefix: rotated.record.prefix }),
    }).catch(() => {});

    // Plaintext shown once — never re-fetchable.
    return NextResponse.json({ data: { record: rotated.record, token: rotated.token } });
  } catch (err) {
    console.error("POST /api/admin/api-tokens/[id]/rotate error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
