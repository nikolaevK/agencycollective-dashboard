export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  listCustomAdPlatformOptions,
  addCustomAdPlatformOption,
  renameCustomAdPlatformOption,
  removeCustomAdPlatformOption,
} from "@/lib/adPlatformOptions";
import { logAuditEvent } from "@/lib/auditLog";
import { requireAdminRecord as requireAdmin } from "@/lib/api/requireAdmin";


function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}


/** Custom ad-platform options (built-ins live in the client bundle). */
export async function GET() {
  if (!(await requireAdmin())) return unauthorized();
  const options = await listCustomAdPlatformOptions();
  return NextResponse.json({ data: options });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();
  try {
    const body = (await request.json()) as { label?: unknown };
    const { option, error } = await addCustomAdPlatformOption(body.label);
    if (error || !option)
      return NextResponse.json({ error: error ?? "Invalid request" }, { status: 400 });

    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "ad_platform_option.create",
      targetType: "ad_platform_option",
      targetId: option.value,
      details: JSON.stringify(option),
    }).catch(() => {});

    return NextResponse.json({ data: option });
  } catch (err) {
    console.error("[admin/ad-platform-options POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();
  try {
    const body = (await request.json()) as { value?: unknown; label?: unknown };
    const value = String(body.value ?? "").trim();
    if (!value)
      return NextResponse.json({ error: "value is required" }, { status: 400 });
    const { option, error } = await renameCustomAdPlatformOption(value, body.label);
    if (error || !option)
      return NextResponse.json({ error: error ?? "Invalid request" }, { status: 400 });

    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "ad_platform_option.rename",
      targetType: "ad_platform_option",
      targetId: option.value,
      details: JSON.stringify(option),
    }).catch(() => {});

    return NextResponse.json({ data: option });
  } catch (err) {
    console.error("[admin/ad-platform-options PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();
  try {
    const { searchParams } = new URL(request.url);
    const value = searchParams.get("value");
    if (!value)
      return NextResponse.json({ error: "value is required" }, { status: 400 });
    await removeCustomAdPlatformOption(value);

    logAuditEvent({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "ad_platform_option.delete",
      targetType: "ad_platform_option",
      targetId: value,
      details: JSON.stringify({ value }),
    }).catch(() => {});

    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    console.error("[admin/ad-platform-options DELETE]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
