export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { getCloserSession } from "@/lib/closerSession";
import { getConversationMessages } from "@/lib/ghl/conversations";
import { GhlApiError, GhlNotConfiguredError, describeError } from "@/lib/ghl/client";

export async function GET(
  _req: Request,
  { params }: { params: { conversationId: string } }
) {
  if (!getAdminSession() && !getCloserSession()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const messages = await getConversationMessages(params.conversationId);
    return NextResponse.json({ data: messages });
  } catch (err) {
    if (err instanceof GhlNotConfiguredError) {
      return NextResponse.json({ error: err.message, code: "GHL_NOT_CONFIGURED" }, { status: 503 });
    }
    if (err instanceof GhlApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[ghl-thread-messages]", describeError(err));
    return NextResponse.json({ error: "Failed to load messages" }, { status: 500 });
  }
}
