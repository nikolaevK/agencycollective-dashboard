export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { getOrCreateConversation, markAdminRead } from "@/lib/conversations";
import { rateLimitedResponse } from "@/lib/rateLimit";

interface Params { params: { userId: string } }

export async function POST(_request: Request, { params }: Params) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = rateLimitedResponse(`support-read:admin:${session.adminId}`, 180);
  if (limited) return limited;

  const conversation = await getOrCreateConversation(params.userId);
  await markAdminRead(conversation.id);
  return NextResponse.json({ ok: true });
}
