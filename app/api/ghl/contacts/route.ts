export const dynamic = "force-dynamic";
// Vercel kills serverless functions at 10s by default; the contacts batch
// fans out to GHL and can take 5–30s on a cold tenant. Pin to 30s.
export const maxDuration = 30;

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { getCloserSession } from "@/lib/closerSession";
import { getContactBatch, MAX_PAGE_LIMIT } from "@/lib/ghl/contacts";
import { GhlApiError, GhlNotConfiguredError, describeError } from "@/lib/ghl/client";
import { parseSubAccountId } from "@/lib/ghl/subAccounts";

export async function GET(request: NextRequest) {
  if (!getAdminSession() && !getCloserSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const query = searchParams.get("query") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageLimit = Math.min(
    MAX_PAGE_LIMIT,
    Math.max(1, Number(searchParams.get("pageLimit") ?? String(MAX_PAGE_LIMIT)) || MAX_PAGE_LIMIT)
  );
  const subAccountId = parseSubAccountId(searchParams.get("subAccount"));

  try {
    const batch = await getContactBatch({ query, page, pageLimit, subAccountId });
    return NextResponse.json({ data: batch });
  } catch (err) {
    if (err instanceof GhlNotConfiguredError) {
      return NextResponse.json({ error: err.message, code: "GHL_NOT_CONFIGURED" }, { status: 503 });
    }
    if (err instanceof GhlApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[ghl-contacts] list error:", describeError(err));
    return NextResponse.json({ error: "Failed to load GHL contacts" }, { status: 500 });
  }
}
