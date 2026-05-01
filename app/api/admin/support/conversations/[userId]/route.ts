export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findUser } from "@/lib/users";
import {
  findConversationByUserId,
  listRecentMessages,
  resolveSenders,
  markAdminRead,
} from "@/lib/conversations";
import { rateLimitedResponse } from "@/lib/rateLimit";

interface Params { params: { userId: string } }

/**
 * Initial load for a single client thread on the admin side. Resolves user
 * info + recent messages + sender identities in one shot, and bumps the
 * admin-read marker so the inbox unread badge clears.
 */
export async function GET(_request: Request, { params }: Params) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = rateLimitedResponse(`support-read:admin:${session.adminId}`, 180);
  if (limited) return limited;

  const user = await findUser(params.userId);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const conversation = await findConversationByUserId(params.userId);
  if (!conversation) {
    // No conversation yet — return a minimal payload so the UI can still
    // show the user header + an empty thread + an input box.
    return NextResponse.json({
      data: {
        conversation: null,
        user: { id: user.id, displayName: user.displayName, slug: user.slug },
        messages: [],
        senders: {},
      },
    });
  }

  const messages = await listRecentMessages(conversation.id);
  const senders = await resolveSenders(messages);
  await markAdminRead(conversation.id);

  return NextResponse.json({
    data: {
      conversation,
      user: { id: user.id, displayName: user.displayName, slug: user.slug },
      messages,
      senders,
    },
  });
}
