export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAllAgencyConfigs } from "@/lib/agencyConfig";

// Only these keys are readable without authentication. Payment templates
// (bank account/routing numbers) and any other config rows must never be
// served here — admin surfaces read them via /api/admin/agency-config.
const PUBLIC_CONFIG_KEYS = new Set([
  "sender",
  "note_local",
  "note_international",
  "default_logo",
  "default_theme_color",
]);

/** Public read-only endpoint for agency config (sender info + note templates). */
export async function GET() {
  const configs = await getAllAgencyConfigs();
  const map: Record<string, string> = {};
  for (const c of configs) {
    if (PUBLIC_CONFIG_KEYS.has(c.configKey)) {
      map[c.configKey] = c.configValue;
    }
  }
  return NextResponse.json({ data: map });
}
