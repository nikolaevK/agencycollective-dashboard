export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAllAgencyConfigs } from "@/lib/agencyConfig";

/** Public read-only endpoint for agency config (sender info + note templates). */
export async function GET() {
  const configs = await getAllAgencyConfigs();
  const map: Record<string, string> = {};
  for (const c of configs) {
    map[c.configKey] = c.configValue;
  }
  return NextResponse.json({ data: map });
}
