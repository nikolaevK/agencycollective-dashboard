export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { findUser } from "@/lib/users";
import { readActiveAccountsForUser } from "@/lib/clientAccounts";
import { fetchAccountActivities, fetchAccountInsights } from "@/lib/meta/endpoints";
import { transformInsight } from "@/lib/meta/transformers";
import cache, { TTL } from "@/lib/cache";
import { parseDateRangeFromParams, getPreviousPeriod, dateRangeCacheKey, percentChange } from "@/lib/utils";
import { RateLimitError, TokenExpiredError } from "@/lib/meta/client";
import type { ApiResponse } from "@/types/api";
import type { ActivityFeedItem, PerformanceShiftMetric } from "@/types/dashboard";

const SHIFT_THRESHOLD = 20;

const METRICS_TO_CHECK: Array<{
  key: PerformanceShiftMetric;
  label: string;
}> = [
  { key: "spend", label: "Spend" },
  { key: "roas", label: "ROAS" },
  { key: "ctr", label: "CTR" },
  { key: "cpc", label: "CPC" },
  { key: "conversions", label: "Conversions" },
];

function portalActivitiesCacheKey(accountId: string, dateKey: string) {
  return `portal:activities:${accountId}:${dateKey}`;
}

export async function GET(request: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const userRecord = await findUser(session.userId);
    if (!userRecord) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const requestedAccountId = searchParams.get("accountId");
    let accountId = session.accountId || userRecord.accountId;

    // Validate account ownership
    const userAccounts = await readActiveAccountsForUser(session.userId);
    if (requestedAccountId) {
      if (userAccounts.some((a) => a.accountId === requestedAccountId)) {
        accountId = requestedAccountId;
      }
    }

    if (!accountId || !/^act_\d+$/.test(accountId)) {
      return NextResponse.json({ error: "No valid account ID available" }, { status: 400 });
    }

    const dateRange = parseDateRangeFromParams(searchParams);
    const dateKey = dateRangeCacheKey(dateRange);

    const cacheKey = portalActivitiesCacheKey(accountId, dateKey);
    const cached = cache.get<ActivityFeedItem[]>(cacheKey);
    if (cached) {
      const response: ApiResponse<ActivityFeedItem[]> = {
        data: cached,
        meta: { cached: true, timestamp: Date.now(), dateRange: dateKey },
      };
      return NextResponse.json(response, {
        headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=120" },
      });
    }

    const prevDateRange = getPreviousPeriod(dateRange);

    const [activities, currentRaw, previousRaw] = await Promise.all([
      fetchAccountActivities(accountId),
      fetchAccountInsights(accountId, dateRange),
      fetchAccountInsights(accountId, prevDateRange),
    ]);

    const items: ActivityFeedItem[] = [];

    for (let i = 0; i < activities.length; i++) {
      const a = activities[i];
      items.push({
        id: `activity-${i}`,
        type: "meta_activity",
        timestamp: a.event_time,
        title: a.translated_event_type || a.event_type,
        description: a.object_name
          ? `${a.object_name}${a.actor_name ? ` by ${a.actor_name}` : ""}`
          : a.actor_name || "",
        actorName: a.actor_name,
        objectName: a.object_name,
        eventType: a.event_type,
      });
    }

    const current = currentRaw[0] ? transformInsight(currentRaw[0]) : null;
    const previous = previousRaw[0] ? transformInsight(previousRaw[0]) : null;

    if (current && previous) {
      for (const metric of METRICS_TO_CHECK) {
        const currentVal = current[metric.key];
        const previousVal = previous[metric.key];
        const pct = percentChange(currentVal, previousVal);

        if (pct !== null && Math.abs(pct) >= SHIFT_THRESHOLD) {
          const verb = pct > 0 ? "increased" : "decreased";
          const absChange = Math.round(Math.abs(pct));

          items.push({
            id: `shift-${metric.key}`,
            type: "performance_shift",
            timestamp: new Date().toISOString(),
            title: `${metric.label} ${verb} by ${absChange}%`,
            description: "Compared to previous period",
            metric: metric.key,
            direction: pct > 0 ? "up" : "down",
            percentChange: Math.round(pct),
          });
        }
      }
    }

    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    cache.set(cacheKey, items, TTL.ACTIVITIES);

    const response: ApiResponse<ActivityFeedItem[]> = {
      data: items,
      meta: { cached: false, timestamp: Date.now(), dateRange: dateKey },
    };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=120" },
    });
  } catch (err) {
    return handleError(err);
  }
}

function handleError(err: unknown) {
  if (err instanceof RateLimitError) {
    return NextResponse.json(
      { error: err.message, retryAfter: err.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(err.retryAfterSeconds) } }
    );
  }
  if (err instanceof TokenExpiredError) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
  console.error("Portal activities API error:", err);
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Internal server error" },
    { status: 500 }
  );
}
