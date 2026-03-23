export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCloserSession } from "@/lib/closerSession";
import { readDealsByCloser, findDeal, deleteDeal } from "@/lib/deals";

export async function GET() {
  const session = getCloserSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deals = await readDealsByCloser(session.closerId);
  return NextResponse.json({ data: deals });
}

export async function DELETE(request: Request) {
  const session = getCloserSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Verify the deal belongs to this closer
  const deal = await findDeal(id);
  if (!deal || deal.closerId !== session.closerId) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const deleted = await deleteDeal(id);
  if (!deleted) {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
