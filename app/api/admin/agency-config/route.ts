export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { getAllAgencyConfigs, updateAgencyConfig } from "@/lib/agencyConfig";

export async function GET() {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const configs = await getAllAgencyConfigs();
  return NextResponse.json({ data: configs });
}

export async function PATCH(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { key, value } = body;
    if (!key || typeof value !== "string") {
      return NextResponse.json({ error: "key and value required" }, { status: 400 });
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
