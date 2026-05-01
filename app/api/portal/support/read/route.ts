export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getOrCreateConversation, markUserRead } from "@/lib/conversations";
import { rateLimitedResponse } from "@/lib/rateLimit";

export async function POST() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Cheap UPSERT, but bound it anyway — same client-read bucket as the GETs.
  const limited = rateLimitedResponse(`support-read:client:${session.userId}`, 120);
  if (limited) return limited;

  const conversation = await getOrCreateConversation(session.userId);
  await markUserRead(conversation.id);
  return NextResponse.json({ ok: true });
}
