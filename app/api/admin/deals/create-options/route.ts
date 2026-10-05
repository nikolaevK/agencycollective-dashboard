export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireDealReviewer } from "@/lib/api/dealDraftActor";
import { readClosers, HOUSE_CLOSER_ID, HOUSE_CLOSER_NAME } from "@/lib/closers";

/**
 * Pickers for the Deal queue's "New deal" form: the House closer (the default
 * credit target — its row is created by the POST on first use, so this GET
 * stays read-only), plus the ACTIVE closers and setters a deal can be
 * credited to (the create route rejects anyone else).
 */
export async function GET() {
  const guard = await requireDealReviewer();
  if (guard.response) return guard.response;

  try {
    const active = (await readClosers()).filter((c) => c.status === "active");
    const option = (c: { id: string; displayName: string }) => ({ id: c.id, displayName: c.displayName });
    return NextResponse.json({
      data: {
        house: { id: HOUSE_CLOSER_ID, displayName: HOUSE_CLOSER_NAME },
        closers: active.filter((c) => c.role !== "setter").map(option),
        setters: active.filter((c) => c.role === "setter").map(option),
      },
    });
  } catch (err) {
    console.error("[admin/deals/create-options GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
