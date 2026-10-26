export const dynamic = "force-dynamic";
// Each deal costs a few DocuSeal GETs; a batch stays well inside this.
export const maxDuration = 120;

import { NextResponse } from "next/server";
import { requireDealReviewer } from "@/lib/api/dealDraftActor";
import { backfillExemplars, exemplarCount, type BackfillCursor } from "@/lib/dealPrepExemplars";

const BATCH = 15;

function parseCursor(raw: unknown): BackfillCursor | null {
  if (!raw || typeof raw !== "object") return null;
  const { createdAt, id } = raw as Record<string, unknown>;
  return typeof createdAt === "string" && typeof id === "string" ? { createdAt, id } : null;
}

/**
 * "Learn from past deals": record what was sent for already-sent deals closed
 * in the last DEAL_PREP_LEARN_DAYS (30) that have no exemplar yet — one batch per call: { cursor? } → { …, next }; the
 * client repeats with `next` until it is null. Deals whose DocuSeal templates
 * can't be read are counted as failed and retried by a later run. Read-only
 * towards DocuSeal.
 */
export async function POST(request: Request) {
  const guard = await requireDealReviewer();
  if (guard.response) return guard.response;

  try {
    const body = await request.json().catch(() => null);
    const result = await backfillExemplars(BATCH, parseCursor(body?.cursor));
    return NextResponse.json({ data: { ...result, total: await exemplarCount() } });
  } catch (err) {
    console.error("[admin/deals/prep-exemplars POST]", err);
    return NextResponse.json({ error: "Learning from past deals failed" }, { status: 500 });
  }
}
