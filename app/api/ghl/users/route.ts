export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CATALOG_CACHE_HEADER = "private, max-age=60, stale-while-revalidate=300";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { getActiveCloserSession } from "@/lib/closerGuards";
import { getUserMap } from "@/lib/ghl/users";
import { GhlApiError, GhlNotConfiguredError, describeError } from "@/lib/ghl/client";
import { parseSubAccountId } from "@/lib/ghl/subAccounts";

export async function GET(request: NextRequest) {
  if (!getAdminSession() && !(await getActiveCloserSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subAccountId = parseSubAccountId(request.nextUrl.searchParams.get("subAccount"));

  try {
    const users = await getUserMap(subAccountId);
    return NextResponse.json(
      { data: users },
      { headers: { "Cache-Control": CATALOG_CACHE_HEADER } }
    );
  } catch (err) {
    if (err instanceof GhlNotConfiguredError) {
      return NextResponse.json({ error: err.message, code: "GHL_NOT_CONFIGURED" }, { status: 503 });
    }
    if (err instanceof GhlApiError) {
      // The users endpoint returning 403 usually means the PIT lacks
      // users.readonly. Falls back to an empty map on the client.
      if (err.status === 403) {
        return NextResponse.json({ data: {} });
      }
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[ghl-users]", describeError(err));
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }
}
