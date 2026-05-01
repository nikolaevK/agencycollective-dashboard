export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import {
  listAllFeedback,
  getRepliesForFeedbackIds,
  isFeedbackStatus,
  type FeedbackStatus,
} from "@/lib/feedback";
import { rateLimitedResponse } from "@/lib/rateLimit";

export async function GET(request: Request) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = rateLimitedResponse(`support-read:admin:${session.adminId}`, 180);
  if (limited) return limited;

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const userId = url.searchParams.get("userId") ?? undefined;
  const status: FeedbackStatus | undefined = isFeedbackStatus(statusParam) ? statusParam : undefined;

  const feedback = await listAllFeedback({ status, userId });
  const replies = await getRepliesForFeedbackIds(feedback.map((f) => f.id));

  return NextResponse.json({
    data: feedback.map((f) => ({ ...f, replies: replies[f.id] ?? [] })),
  });
}
