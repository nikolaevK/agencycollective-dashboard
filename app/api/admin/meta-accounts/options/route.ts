export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import {
  parseMetaOptionKind,
  listMetaAccountOptions,
  listAllMetaAccountOptions,
  addMetaAccountOption,
  updateMetaAccountOption,
  reorderMetaAccountOptions,
  removeMetaAccountOption,
} from "@/lib/metaAccountOptions";
import { logAuditEvent } from "@/lib/auditLog";

async function requireAdmin() {
  const session = getAdminSession();
  if (!session) return null;
  return findAdmin(session.adminId);
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function badKind() {
  return NextResponse.json({ error: "kind must be 'stage' or 'status'" }, { status: 400 });
}

/**
 * Stage / Status chip vocabulary for the Meta Accounts Directory.
 * With ?kind= returns that kind's list; without it returns BOTH as
 * { stage, status } in one DB round-trip (the page-load path).
 */
export async function GET(request: Request) {
  if (!(await requireAdmin())) return unauthorized();
  const { searchParams } = new URL(request.url);
  const rawKind = searchParams.get("kind");
  if (rawKind === null) {
    return NextResponse.json({ data: await listAllMetaAccountOptions() });
  }
  const kind = parseMetaOptionKind(rawKind);
  if (!kind) return badKind();
  return NextResponse.json({ data: await listMetaAccountOptions(kind) });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();
  try {
    const body = (await request.json()) as { kind?: unknown; label?: unknown; color?: unknown };
    const kind = parseMetaOptionKind(body.kind);
    if (!kind) return badKind();
    const { option, error } = await addMetaAccountOption(kind, body.label, body.color);
    if (error || !option)
      return NextResponse.json({ error: error ?? "Invalid request" }, { status: 400 });

    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "meta_account_option.create",
      targetType: `meta_${kind}_option`,
      targetId: option.value,
      details: JSON.stringify({ kind, ...option }),
    }).catch(() => {});

    return NextResponse.json({ data: option });
  } catch (err) {
    console.error("[admin/meta-accounts/options POST]", err);
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
      color?: unknown;
      action?: unknown;
      order?: unknown;
    };
    const kind = parseMetaOptionKind(body.kind);
    if (!kind) return badKind();

    // Reorder: PATCH { kind, action:"reorder", order:[value,...] }
    if (body.action === "reorder") {
      if (!Array.isArray(body.order) || body.order.some((v) => typeof v !== "string"))
        return NextResponse.json({ error: "order must be an array of values" }, { status: 400 });
      await reorderMetaAccountOptions(kind, body.order as string[]);
      logAuditEvent({
        adminId: admin.id,
        adminUsername: admin.username,
        action: "meta_account_option.reorder",
        targetType: `meta_${kind}_option`,
        targetId: kind,
        details: JSON.stringify({ kind, order: body.order }),
      }).catch(() => {});
      return NextResponse.json({ data: await listMetaAccountOptions(kind) });
    }

    // Edit label/color: PATCH { kind, value, label?, color? }
    const value = String(body.value ?? "").trim();
    if (!value) return NextResponse.json({ error: "value is required" }, { status: 400 });
    const { option, error } = await updateMetaAccountOption(kind, value, {
      label: body.label,
      color: body.color,
    });
    if (error || !option)
      return NextResponse.json({ error: error ?? "Invalid request" }, { status: 400 });

    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "meta_account_option.update",
      targetType: `meta_${kind}_option`,
      targetId: option.value,
      details: JSON.stringify({ kind, ...option }),
    }).catch(() => {});

    return NextResponse.json({ data: option });
  } catch (err) {
    console.error("[admin/meta-accounts/options PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();
  try {
    const { searchParams } = new URL(request.url);
    const kind = parseMetaOptionKind(searchParams.get("kind"));
    if (!kind) return badKind();
    const value = searchParams.get("value");
    if (!value) return NextResponse.json({ error: "value is required" }, { status: 400 });
    await removeMetaAccountOption(kind, value);

    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "meta_account_option.delete",
      targetType: `meta_${kind}_option`,
      targetId: value,
      details: JSON.stringify({ kind, value }),
    }).catch(() => {});

    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    console.error("[admin/meta-accounts/options DELETE]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
