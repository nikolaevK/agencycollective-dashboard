export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { deletePushSubscription } from "@/lib/pushNotifications";

export async function POST(request: Request) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { endpoint } = body as { endpoint?: string };

  if (!endpoint || typeof endpoint !== "string") {
    return NextResponse.json({ error: "Invalid endpoint" }, { status: 400 });
  }

  await deletePushSubscription(endpoint, session.adminId);
  return NextResponse.json({ ok: true });
}
