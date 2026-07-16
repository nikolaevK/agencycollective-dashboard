export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { getAllAgencyConfigs, updateAgencyConfig } from "@/lib/agencyConfig";

// Writable config keys and the permission each requires. Unknown keys are
// rejected — this route must never be an arbitrary-key write path (payment
// templates carry bank account/routing numbers).
const WRITABLE_CONFIG_KEYS: Record<string, "invoice"> = {
  sender: "invoice",
  note_local: "invoice",
  note_international: "invoice",
  payment_template_local: "invoice",
  payment_template_international: "invoice",
  default_logo: "invoice",
  default_theme_color: "invoice",
};

export async function GET() {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const configs = await getAllAgencyConfigs();
  const map: Record<string, string> = {};
  for (const c of configs) {
    map[c.configKey] = c.configValue;
  }
  return NextResponse.json({ data: map });
}

export async function PATCH(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { key, value } = body;
    if (!key || typeof key !== "string" || typeof value !== "string") {
      return NextResponse.json({ error: "key and value required" }, { status: 400 });
    }
    const requiredPerm = WRITABLE_CONFIG_KEYS[key];
    if (!requiredPerm) {
      return NextResponse.json({ error: "Unknown config key" }, { status: 400 });
    }
    // Role truth is the DB, never the session token.
    const admin = await findAdmin(session.adminId);
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!admin.isSuper && !admin.permissions[requiredPerm]) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (value.length > 1_000_000) {
      return NextResponse.json({ error: "Value too large" }, { status: 413 });
    }

    await updateAgencyConfig(key, value);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[agency-config PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
