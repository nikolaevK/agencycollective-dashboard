export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  parseRosterOptionKind,
  listCustomRosterOptions,
  addCustomRosterOption,
  renameCustomRosterOption,
  removeCustomRosterOption,
} from "@/lib/rosterOptions";
import { logAuditEvent } from "@/lib/auditLog";
import { requireAdminRecord as requireAdmin } from "@/lib/api/requireAdmin";


function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function badKind() {
  return NextResponse.json(
    { error: "kind must be 'stage' or 'health'" },
    { status: 400 }
  );
}


/** Custom Stage / Client Health options (built-ins live in the client bundle). */
export async function GET(request: Request) {
  if (!(await requireAdmin())) return unauthorized();
  const { searchParams } = new URL(request.url);
  const kind = parseRosterOptionKind(searchParams.get("kind"));
  if (!kind) return badKind();
  const options = await listCustomRosterOptions(kind);
  return NextResponse.json({ data: options });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();
  try {
    const body = (await request.json()) as { kind?: unknown; label?: unknown };
    const kind = parseRosterOptionKind(body.kind);
    if (!kind) return badKind();
    const { option, error } = await addCustomRosterOption(kind, body.label);
    if (error || !option)
      return NextResponse.json({ error: error ?? "Invalid request" }, { status: 400 });

    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "roster_option.create",
      targetType: `${kind}_option`,
      targetId: option.value,
      details: JSON.stringify({ kind, ...option }),
    }).catch(() => {});

    return NextResponse.json({ data: option });
  } catch (err) {
    console.error("[admin/roster-options POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();
  try {
    const body = (await request.json()) as {
      kind?: unknown;
      value?: unknown;
      label?: unknown;
    };
    const kind = parseRosterOptionKind(body.kind);
    if (!kind) return badKind();
    const value = String(body.value ?? "").trim();
    if (!value)
      return NextResponse.json({ error: "value is required" }, { status: 400 });
    const { option, error } = await renameCustomRosterOption(kind, value, body.label);
    if (error || !option)
      return NextResponse.json({ error: error ?? "Invalid request" }, { status: 400 });

    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "roster_option.rename",
      targetType: `${kind}_option`,
      targetId: option.value,
      details: JSON.stringify({ kind, ...option }),
    }).catch(() => {});

    return NextResponse.json({ data: option });
  } catch (err) {
    console.error("[admin/roster-options PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();
  try {
    const { searchParams } = new URL(request.url);
    const kind = parseRosterOptionKind(searchParams.get("kind"));
    if (!kind) return badKind();
    const value = searchParams.get("value");
    if (!value)
      return NextResponse.json({ error: "value is required" }, { status: 400 });
    await removeCustomRosterOption(kind, value);

    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "roster_option.delete",
      targetType: `${kind}_option`,
      targetId: value,
      details: JSON.stringify({ kind, value }),
    }).catch(() => {});

    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    console.error("[admin/roster-options DELETE]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
