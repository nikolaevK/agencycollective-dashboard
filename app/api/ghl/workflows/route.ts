export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CATALOG_CACHE_HEADER = "private, max-age=60, stale-while-revalidate=300";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { getCloserSession } from "@/lib/closerSession";
import { listWorkflows } from "@/lib/ghl/workflows";
import { GhlApiError, GhlNotConfiguredError, describeError } from "@/lib/ghl/client";

export async function GET() {
  if (!getAdminSession() && !getCloserSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const workflows = await listWorkflows();
    return NextResponse.json(
      { data: workflows },
      { headers: { "Cache-Control": CATALOG_CACHE_HEADER } }
    );
  } catch (err) {
    if (err instanceof GhlNotConfiguredError) {
      return NextResponse.json({ error: err.message, code: "GHL_NOT_CONFIGURED" }, { status: 503 });
    }
    if (err instanceof GhlApiError) {
      if (err.status === 401 || err.status === 403) {
        return NextResponse.json({ data: [] });
      }
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[ghl-workflows]", describeError(err));
    return NextResponse.json({ error: "Failed to load workflows" }, { status: 500 });
  }
}
