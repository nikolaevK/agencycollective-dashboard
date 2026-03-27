export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCloserSession } from "@/lib/closerSession";
import { updateCloser } from "@/lib/closers";

export async function PATCH(request: Request) {
  const session = getCloserSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const quotaDollars = Number(body.quota ?? 0);

    if (!Number.isFinite(quotaDollars) || quotaDollars < 0 || quotaDollars > 10_000_000) {
      return NextResponse.json({ error: "Invalid quota value" }, { status: 400 });
    }

    const quotaCents = Math.round(quotaDollars * 100);
    await updateCloser(session.closerId, { quota: quotaCents });

    return NextResponse.json({ data: { quota: quotaCents } });
  } catch (err) {
    console.error("[closer/quota PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
