export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireDealReviewer } from "@/lib/api/dealDraftActor";
import { listDealDrafts, DEAL_DRAFT_REVIEW_STATUSES, type DealDraftStatus } from "@/lib/dealDrafts";
import { readClosers } from "@/lib/closers";

/**
 * Deal drafts for the Deal queue's approval panel. `?status=pending` (default)
 * | approved | rejected | all. Each row carries the closer's display name.
 */
export async function GET(request: Request) {
  const guard = await requireDealReviewer();
  if (guard.response) return guard.response;

  const raw = new URL(request.url).searchParams.get("status") ?? "pending";
  const status = DEAL_DRAFT_REVIEW_STATUSES.includes(raw as DealDraftStatus)
    ? (raw as DealDraftStatus)
    : undefined;
  if (!status && raw !== "all") return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  try {
    const [drafts, closers] = await Promise.all([listDealDrafts({ status, limit: 200 }), readClosers({ includeSystem: true })]);
    const names = new Map(closers.map((c) => [c.id, c.displayName]));
    return NextResponse.json({
      data: drafts.map((d) => ({ ...d, closerName: names.get(d.fields.closerId) ?? null })),
    });
  } catch (err) {
    console.error("[admin/deals/drafts GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
