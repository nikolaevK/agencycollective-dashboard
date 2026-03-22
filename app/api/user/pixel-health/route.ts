export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { findUser } from "@/lib/users";
import { readActiveAccountsForUser } from "@/lib/clientAccounts";
import { fetchAccountPixels, fetchPixelStats, fetchPixelDaChecks } from "@/lib/meta/endpoints";
import cache, { TTL } from "@/lib/cache";
import { RateLimitError, TokenExpiredError } from "@/lib/meta/client";
import type { ApiResponse } from "@/types/api";
import type { PixelHealth, PixelStatsPeriod } from "@/types/dashboard";
import { subDays, format } from "date-fns";

function portalPixelCacheKey(accountId: string, period: string) {
  return `portal:pixel_health:${accountId}:${period}`;
}

function periodToDateRange(period: PixelStatsPeriod): { since: string; until: string } {
  const now = new Date();
  const until = format(now, "yyyy-MM-dd");
  const daysMap: Record<PixelStatsPeriod, number> = {
    last_24h: 1,
    last_7d: 7,
    last_30d: 30,
  };
  const since = format(subDays(now, daysMap[period]), "yyyy-MM-dd");
  return { since, until };
}

const PERIOD_LABELS: Record<PixelStatsPeriod, string> = {
  last_24h: "Last 24 hours",
  last_7d: "Last 7 days",
  last_30d: "Last 30 days",
};

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

    const rawPeriod = searchParams.get("period");
    const period: PixelStatsPeriod =
      rawPeriod === "last_24h" || rawPeriod === "last_7d" || rawPeriod === "last_30d"
        ? rawPeriod
        : "last_7d";
    const { since, until } = periodToDateRange(period);

    const cacheKey = portalPixelCacheKey(accountId, period);
    const cached = cache.get<PixelHealth[]>(cacheKey);
    if (cached) {
      const response: ApiResponse<PixelHealth[]> = {
        data: cached,
        meta: { cached: true, timestamp: Date.now(), dateRange: PERIOD_LABELS[period] },
      };
      return NextResponse.json(response, {
        headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=240" },
      });
    }

    const pixels = await fetchAccountPixels(accountId);

    const pixelHealthData: PixelHealth[] = await Promise.all(
      pixels.map(async (pixel) => {
        const [stats, daChecks] = await Promise.all([
          fetchPixelStats(pixel.id, since, until),
          fetchPixelDaChecks(pixel.id),
        ]);

        return {
          id: pixel.id,
          name: pixel.name,
          createdAt: pixel.creation_time,
          lastFiredTime: pixel.last_fired_time,
          isActive: !pixel.is_unavailable && Boolean(pixel.last_fired_time),
          dataUseSetting: pixel.data_use_setting,
          eventStats: stats.map((s) => ({ event: s.event, count: s.count })),
          daChecks: daChecks.map((c) => ({
            key: c.key,
            title: c.title,
            description: c.description,
            result: (["passed", "failed", "warning"].includes(c.result ?? "")
              ? c.result
              : "unknown") as "passed" | "failed" | "warning" | "unknown",
          })),
        };
      })
    );

    cache.set(cacheKey, pixelHealthData, TTL.PIXEL_HEALTH);

    const response: ApiResponse<PixelHealth[]> = {
      data: pixelHealthData,
      meta: { cached: false, timestamp: Date.now(), dateRange: PERIOD_LABELS[period] },
    };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=240" },
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
  console.error("Portal pixel health API error:", err);
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Internal server error" },
    { status: 500 }
  );
}
