export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  getOrCreateConversation,
  listRecentMessages,
  resolveSenders,
  getAdminPresence,
  markUserRead,
} from "@/lib/conversations";
import { listFeedbackByUser, getRepliesForFeedbackIds } from "@/lib/feedback";
import { rateLimitedResponse } from "@/lib/rateLimit";

/**
 * Single fetch for the support page: conversation row, recent messages with
 * resolved sender identities, presence snapshot, and the user's feedback
 * history with replies. Subsequent updates flow through the smaller polling
 * endpoints — this is a one-shot for first paint.
 */
export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Single shared bucket for all client read-side traffic. 120/min is ~20×
  // legitimate steady-state (≈6/min across all polled surfaces) — generous
  // headroom while still bounding amplification attacks.
  const limited = rateLimitedResponse(`support-read:client:${session.userId}`, 120);
  if (limited) return limited;

  const conversation = await getOrCreateConversation(session.userId);
  const [messages, presence, feedback] = await Promise.all([
    listRecentMessages(conversation.id),
    getAdminPresence(),
    listFeedbackByUser(session.userId),
  ]);
  const [senders, replies] = await Promise.all([
    resolveSenders(messages),
    getRepliesForFeedbackIds(feedback.map((f) => f.id)),
  ]);

  // Reset the user's unread count — they're looking at the thread now.
  await markUserRead(conversation.id);

  return NextResponse.json({
    data: {
      conversation,
      messages,
      senders,
      presence,
      feedback: feedback.map((f) => ({ ...f, replies: replies[f.id] ?? [] })),
    },
  });
}
