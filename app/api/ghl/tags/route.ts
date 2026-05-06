export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Catalog data (tags) rarely changes; emit a Cache-Control header so the
// browser skips refetch within 60s and uses stale-while-revalidate for the
// next 5 min. Cuts cross-tab and back/forward navigation cost to zero.
const CATALOG_CACHE_HEADER = "private, max-age=60, stale-while-revalidate=300";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { getCloserSession } from "@/lib/closerSession";
import { listLocationTags } from "@/lib/ghl/tags";
import { GhlApiError, GhlNotConfiguredError, describeError } from "@/lib/ghl/client";

export async function GET() {
  if (!getAdminSession() && !getCloserSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tags = await listLocationTags();
    return NextResponse.json(
      { data: tags },
      { headers: { "Cache-Control": CATALOG_CACHE_HEADER } }
    );
  } catch (err) {
    if (err instanceof GhlNotConfiguredError) {
      return NextResponse.json({ error: err.message, code: "GHL_NOT_CONFIGURED" }, { status: 503 });
    }
    if (err instanceof GhlApiError) {
      // 403 here usually means the PIT is missing the locations.readonly
      // scope — surface the message rather than a generic 500.
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[ghl-tags]", describeError(err));
    return NextResponse.json({ error: "Failed to load tags" }, { status: 500 });
  }
}
