export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireInternalActor } from "@/lib/api/requireAdmin";
import { fetchAccountPages, type AccountPagesSource } from "@/lib/meta/endpoints";
import cache, { CacheKeys, TTL } from "@/lib/cache";
import { RateLimitError, TokenExpiredError } from "@/lib/meta/client";
import type { ApiResponse } from "@/types/api";
import type { MetaPage } from "@/lib/meta/types";

/** `source` tells the draft dialog whether the list is this account's Pages or every Page the token manages. */
type AccountPages = { pages: MetaPage[]; source: AccountPagesSource };

export async function GET(request: Request) {
  // Feeds the Meta WRITE path (publish-draft): same gate — partner
  // (external-workspace) admins get 403, like publish-draft itself.
  const gate = await requireInternalActor();
  if (gate.response) return gate.response;

  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");

    if (!accountId || !/^act_\d+$/.test(accountId)) {
      return NextResponse.json({ error: "Invalid accountId" }, { status: 400 });
    }

    // ":src" — entries now carry the list's source (the old key held bare arrays).
    const cacheKey = `${CacheKeys.accountPages(accountId)}:src`;
    const cached = cache.get<AccountPages>(cacheKey);
    if (cached) {
      const response: ApiResponse<AccountPages> = {
        data: cached,
        meta: { cached: true, timestamp: Date.now() },
      };
      return NextResponse.json(response);
    }

    const pages = await fetchAccountPages(accountId);
    cache.set(cacheKey, pages, TTL.PAGES);

    const response: ApiResponse<AccountPages> = {
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
