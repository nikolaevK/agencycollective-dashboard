export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { insertPushSubscription } from "@/lib/pushNotifications";

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

  const { endpoint, keys } = body as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };

  if (
    !endpoint ||
    !keys?.p256dh ||
    !keys?.auth ||
    typeof endpoint !== "string" ||
    !endpoint.startsWith("https://")
  ) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  try {
    await insertPushSubscription({
      adminId: session.adminId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: request.headers.get("user-agent"),
    });
  } catch (err) {
    console.error("[push/subscribe] Failed to save subscription:", err);
    return NextResponse.json({ error: "Failed to save subscription" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
