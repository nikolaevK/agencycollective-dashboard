export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { ensureMigrated } from "@/lib/db";
import {
  getMetaAccount,
  updateMetaAccount,
  deleteMetaAccount,
  DuplicateMetaAccountEmailError,
  type MetaAccountInput,
} from "@/lib/metaAccounts";
import { logAuditEvent } from "@/lib/auditLog";

interface RouteContext {
  params: { id: string };
}

async function requireAdmin() {
  const session = getAdminSession();
  if (!session) return null;
  return findAdmin(session.adminId);
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

const STRING_FIELDS = [
  "fbEmail",
  "fbPassword",
  "twofaSecret",
  "twofaLink",
  "mailPassword",
  "recoveryEmail",
  "profileLink",
  "bmId",
  "stage",
  "status",
  "assignee",
  "clientId",
  "batch",
  "notes",
] as const;

const BOOLEAN_FIELDS = ["loginOk", "pageMade", "adAccountMade", "bmMade", "cardAdded"] as const;

/** Build a partial update from only the fields present in the body. */
function readChanges(body: Record<string, unknown>): MetaAccountInput {
  const changes: MetaAccountInput = {};
  for (const key of STRING_FIELDS) {
    if (key in body) {
      const v = body[key];
      // null clears the field; a string sets it. Ignore other types.
      if (v === null) (changes as Record<string, unknown>)[key] = null;
      else if (typeof v === "string") (changes as Record<string, unknown>)[key] = v;
    }
  }
  for (const key of BOOLEAN_FIELDS) {
    if (key in body && typeof body[key] === "boolean") {
      (changes as Record<string, unknown>)[key] = body[key];
    }
  }
  return changes;
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();
  await ensureMigrated();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const changes = readChanges(body);
  if ("fbEmail" in changes && !(changes.fbEmail ?? "").trim()) {
    return NextResponse.json({ error: "An account email is required" }, { status: 400 });
  }

  // No existence pre-read — UPDATE's rowsAffected already distinguishes
  // not-found (Turso: every execute is a network round-trip).
  if (Object.keys(changes).length > 0) {
    let ok: boolean;
    try {
      ok = await updateMetaAccount(params.id, changes);
    } catch (err) {
      if (err instanceof DuplicateMetaAccountEmailError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const updated = await getMetaAccount(params.id);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  logAuditEvent({
    adminId: admin.id,
    adminUsername: admin.username,
    action: "meta_account.update",
    targetType: "meta_account",
    targetId: params.id,
    details: JSON.stringify({ fields: Object.keys(changes) }),
  }).catch(() => {});

  return NextResponse.json({ data: updated });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();
  await ensureMigrated();

  const existing = await getMetaAccount(params.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await deleteMetaAccount(params.id);

  logAuditEvent({
    adminId: admin.id,
    adminUsername: admin.username,
    action: "meta_account.delete",
    targetType: "meta_account",
    targetId: params.id,
    details: JSON.stringify({ fbEmail: existing.fbEmail }),
  }).catch(() => {});

  return NextResponse.json({ data: { ok: true } });
}
