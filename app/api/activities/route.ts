export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { fetchAccountActivities, fetchAccountInsights } from "@/lib/meta/endpoints";
import { transformInsight } from "@/lib/meta/transformers";
import cache, { CacheKeys, TTL } from "@/lib/cache";
import { parseDateRangeFromParams, getPreviousPeriod, dateRangeCacheKey, percentChange } from "@/lib/utils";
import { RateLimitError, TokenExpiredError } from "@/lib/meta/client";
import type { ApiResponse } from "@/types/api";
import type { ActivityFeedItem, PerformanceShiftMetric } from "@/types/dashboard";

const SHIFT_THRESHOLD = 20; // percent

const METRICS_TO_CHECK: Array<{
  key: PerformanceShiftMetric;
  label: string;
  positiveIsGood: boolean;
}> = [
  { key: "spend", label: "Spend", positiveIsGood: false },
  { key: "roas", label: "ROAS", positiveIsGood: true },
  { key: "ctr", label: "CTR", positiveIsGood: true },
  { key: "cpc", label: "CPC", positiveIsGood: false },
  { key: "conversions", label: "Conversions", positiveIsGood: true },
];

export async function GET(request: Request) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = await findAdmin(session.adminId);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");
    if (!accountId || !/^act_\d+$/.test(accountId)) {
      return NextResponse.json({ error: "Valid accountId is required" }, { status: 400 });
    }

    const dateRange = parseDateRangeFromParams(searchParams);
    const dateKey = dateRangeCacheKey(dateRange);

    const cacheKey = CacheKeys.activities(accountId, dateKey);
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

    // Fetch activities and insights in parallel
    const [activities, currentRaw, previousRaw] = await Promise.all([
      fetchAccountActivities(accountId),
      fetchAccountInsights(accountId, dateRange),
      fetchAccountInsights(accountId, prevDateRange),
    ]);

    const items: ActivityFeedItem[] = [];

    // Map Meta activities to feed items
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

    // Compute performance shifts
    const current = currentRaw[0] ? transformInsight(currentRaw[0]) : null;
    const previous = previousRaw[0] ? transformInsight(previousRaw[0]) : null;

    if (current && previous) {
      for (const metric of METRICS_TO_CHECK) {
        const currentVal = current[metric.key];
        const previousVal = previous[metric.key];
        const pct = percentChange(currentVal, previousVal);

        if (pct !== null && Math.abs(pct) >= SHIFT_THRESHOLD) {
          const direction = pct > 0 ? "up" : "down";
          const absChange = Math.round(Math.abs(pct));
          const verb = pct > 0 ? "increased" : "decreased";

          items.push({
            id: `shift-${metric.key}`,
            type: "performance_shift",
            timestamp: new Date().toISOString(),
            title: `${metric.label} ${verb} by ${absChange}%`,
            description: `Compared to previous period`,
            metric: metric.key,
            direction,
            percentChange: Math.round(pct),
          });
        }
      }
    }

    // Sort by timestamp descending
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
  console.error("Activities API error:", err);
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Internal server error" },
    { status: 500 }
  );
}
