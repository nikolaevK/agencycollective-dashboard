export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { findUser } from "@/lib/users";
import { readActiveAccountsForUser } from "@/lib/clientAccounts";
import { fetchOwnedAccounts, fetchAllAccountInsightsBatch } from "@/lib/meta/endpoints";
import { transformInsight } from "@/lib/meta/transformers";
import cache, { TTL } from "@/lib/cache";
import { parseDateRangeFromParams } from "@/lib/utils";
import { RateLimitError, TokenExpiredError } from "@/lib/meta/client";
import type { InsightMetrics } from "@/types/dashboard";

function emptyInsights(): InsightMetrics {
  return {
    spend: 0, impressions: 0, reach: 0, clicks: 0,
    ctr: 0, cpc: 0, cpm: 0, roas: 0, conversions: 0, conversionValue: 0, costPerPurchase: 0,
  };
}

export async function GET(request: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRecord = await findUser(session.userId);
  if (!userRecord) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const dateRange = parseDateRangeFromParams(searchParams);

    // Get linked accounts
    const linkedAccounts = await readActiveAccountsForUser(session.userId);
    if (linkedAccounts.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const linkedIds = linkedAccounts.map((a) => a.accountId);

    // Fetch Meta account info (names, status, currency)
    const accountsCacheKey = "accounts:list:full";
    const STATUS_MAP: Record<number, string> = {
      1: "ACTIVE", 2: "DISABLED", 3: "UNSETTLED", 7: "PENDING_REVIEW",
      9: "GRACE_PERIOD", 100: "PENDING_CLOSURE", 101: "CLOSED",
    };
    let metaAccounts = cache.get<Array<{ id: string; name: string; currency: string; status: string }>>(accountsCacheKey);
    if (!metaAccounts) {
      const raw = await fetchOwnedAccounts();
      metaAccounts = raw.map((a) => ({
        id: a.id,
        name: a.name,
        currency: a.currency,
        status: STATUS_MAP[a.account_status] ?? "UNKNOWN",
      }));
      cache.set(accountsCacheKey, metaAccounts, TTL.ACCOUNTS);
    }
    const metaMap = new Map(metaAccounts.map((a) => [a.id, a]));

    // Batch-fetch insights for all linked accounts
    const insightsMap = await fetchAllAccountInsightsBatch(linkedIds, dateRange);

    // Build result
    const result = linkedAccounts.map((linked) => {
      const meta = metaMap.get(linked.accountId);
      const rawInsight = insightsMap.get(linked.accountId);
      const metrics: InsightMetrics = rawInsight ? transformInsight(rawInsight) : emptyInsights();

      return {
        accountId: linked.accountId,
        label: linked.label,
        name: meta?.name ?? linked.accountId,
        currency: meta?.currency ?? "USD",
        status: meta?.status ?? "UNKNOWN",
        metrics,
      };
    });

    return NextResponse.json({ data: result });
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
    console.error("All accounts overview error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
