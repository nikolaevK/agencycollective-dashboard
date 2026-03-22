export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { findUser } from "@/lib/users";
import { readActiveAccountsForUser } from "@/lib/clientAccounts";
import { fetchTopAdsForAccount } from "@/lib/meta/endpoints";
import cache, { TTL } from "@/lib/cache";
import { parseDateRangeFromParams, dateRangeCacheKey } from "@/lib/utils";
import { RateLimitError, TokenExpiredError } from "@/lib/meta/client";

export async function GET(request: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Re-validate user
  const userRecord = await findUser(session.userId);
  if (!userRecord) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const dateRange = parseDateRangeFromParams(searchParams);
    const dateKey = dateRangeCacheKey(dateRange);

    // Allow client-side account selection via query param, with ownership validation
    const requestedAccountId = searchParams.get("accountId");
    let accountId = session.accountId || userRecord.accountId;

    if (requestedAccountId && requestedAccountId !== accountId) {
      const userAccounts = await readActiveAccountsForUser(session.userId);
      if (userAccounts.some((a) => a.accountId === requestedAccountId)) {
        accountId = requestedAccountId;
      }
    }

    const cacheKey = `top_ads:${accountId}:${dateKey}`;
    let topAds = cache.get<Awaited<ReturnType<typeof fetchTopAdsForAccount>>>(cacheKey);

    if (!topAds) {
      topAds = await fetchTopAdsForAccount(accountId, dateRange, 3);
      cache.set(cacheKey, topAds, TTL.ADS);
    }

    return NextResponse.json({ data: topAds }, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=240" },
    });
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
    console.error("Top ads error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
