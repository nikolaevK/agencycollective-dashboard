export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { findCloser } from "@/lib/closers";
import { readDealsByCloser, getCloserDealStats } from "@/lib/deals";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(
  _request: Request,
  { params }: { params: { closerId: string } }
) {
  const session = getAdminSession();
  if (!session) return unauthorized();
  const admin = await findAdmin(session.adminId);
  if (!admin) return unauthorized();

  const closer = await findCloser(params.closerId);
  if (!closer) {
    return NextResponse.json({ error: "Closer not found" }, { status: 404 });
  }

  const [deals, stats] = await Promise.all([
    readDealsByCloser(params.closerId),
    getCloserDealStats(params.closerId),
  ]);

  const { passwordHash: _, ...safeCloser } = closer;

  return NextResponse.json({
    data: {
      closer: { ...safeCloser, hasPassword: _ !== null },
      deals,
      stats,
    },
  });
}
