export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CATALOG_CACHE_HEADER = "private, max-age=60, stale-while-revalidate=300";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { getActiveCloserSession } from "@/lib/closerGuards";
import { listPipelines } from "@/lib/ghl/pipelines";
import { GhlApiError, GhlNotConfiguredError, describeError } from "@/lib/ghl/client";
import { parseSubAccountId } from "@/lib/ghl/subAccounts";

export async function GET(request: NextRequest) {
  if (!getAdminSession() && !(await getActiveCloserSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subAccountId = parseSubAccountId(request.nextUrl.searchParams.get("subAccount"));

  try {
    const pipelines = await listPipelines(subAccountId);
    return NextResponse.json(
      { data: pipelines },
      { headers: { "Cache-Control": CATALOG_CACHE_HEADER } }
    );
  } catch (err) {
    if (err instanceof GhlNotConfiguredError) {
      return NextResponse.json({ error: err.message, code: "GHL_NOT_CONFIGURED" }, { status: 503 });
    }
    if (err instanceof GhlApiError) {
      // Missing opportunities.readonly → empty list rather than a hard error.
      if (err.status === 401 || err.status === 403) {
        return NextResponse.json({ data: [] });
      }
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[ghl-pipelines]", describeError(err));
    return NextResponse.json({ error: "Failed to load pipelines" }, { status: 500 });
  }
}
