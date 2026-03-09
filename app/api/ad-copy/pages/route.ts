export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { fetchAccountPages } from "@/lib/meta/endpoints";
import cache, { CacheKeys, TTL } from "@/lib/cache";
import { RateLimitError, TokenExpiredError } from "@/lib/meta/client";
import type { ApiResponse } from "@/types/api";
import type { MetaPage } from "@/lib/meta/types";

export async function GET(request: Request) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");

    if (!accountId || !/^act_\d+$/.test(accountId)) {
      return NextResponse.json({ error: "Invalid accountId" }, { status: 400 });
    }

    const cacheKey = CacheKeys.accountPages(accountId);
    const cached = cache.get<MetaPage[]>(cacheKey);
    if (cached) {
      const response: ApiResponse<MetaPage[]> = {
        data: cached,
        meta: { cached: true, timestamp: Date.now() },
      };
      return NextResponse.json(response);
    }

    const pages = await fetchAccountPages(accountId);
    cache.set(cacheKey, pages, TTL.PAGES);

    const response: ApiResponse<MetaPage[]> = {
      data: pages,
      meta: { cached: false, timestamp: Date.now() },
    };
    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: err.message, retryAfter: err.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(err.retryAfterSeconds) } }
      );
    }
    if (err instanceof TokenExpiredError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[ad-copy/pages] API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
