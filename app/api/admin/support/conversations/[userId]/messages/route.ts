export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findUser } from "@/lib/users";
import {
  clearConversationMessages,
  createMessage,
  findConversationByUserId,
  getOrCreateConversation,
  listMessagesSince,
  resolveSenders,
  MESSAGE_BODY_MAX,
} from "@/lib/conversations";
import { logAuditEvent } from "@/lib/auditLog";
import { checkRate, rateLimitedResponse } from "@/lib/rateLimit";
import { waitUntil } from "@vercel/functions";

interface Params { params: { userId: string } }

export async function GET(request: Request, { params }: Params) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = rateLimitedResponse(`support-read:admin:${session.adminId}`, 180);
  if (limited) return limited;

  const conversation = await getOrCreateConversation(params.userId);

  const url = new URL(request.url);
  const sinceTs = url.searchParams.get("since");
  const sinceId = url.searchParams.get("sinceId") ?? "";
  if (!sinceTs) return NextResponse.json({ error: "since is required" }, { status: 400 });

  const messages = await listMessagesSince(conversation.id, { createdAt: sinceTs, id: sinceId });
  const senders = messages.length > 0 ? await resolveSenders(messages) : {};
  return NextResponse.json({ data: { messages, senders } });
}

export async function POST(request: Request, { params }: Params) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Per-admin cap. Higher than the client cap because admins legitimately fan
  // out across many clients in a single sitting.
  const rate = checkRate(`chat:admin:${session.adminId}`, 60, 60_000);
  if (!rate.ok) {
    return NextResponse.json(
      { error: "Too many messages. Please slow down." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } }
    );
  }

  const user = await findUser(params.userId);
  if (!user) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const body = String(payload.body ?? "").trim();
  if (!body) return NextResponse.json({ error: "body is required" }, { status: 400 });
  if (body.length > MESSAGE_BODY_MAX) {
    return NextResponse.json({ error: `body must be ${MESSAGE_BODY_MAX} characters or fewer` }, { status: 400 });
  }

  const conversation = await getOrCreateConversation(params.userId);
  const message = await createMessage({
    conversationId: conversation.id,
    senderType: "admin",
    senderId: session.adminId,
    body,
  });
  const senders = await resolveSenders([message]);
  return NextResponse.json({ data: { message, senders } }, { status: 201 });
}

/**
 * Wipe every message in this client's conversation. Conversation row stays;
 * read markers + last_message_at reset so the thread reads as fresh on both
 * sides. Destructive, so we audit-log it under waitUntil — Vercel keeps the
 * lambda alive long enough for the audit row to land, and the .catch keeps a
 * logging hiccup from blocking the delete.
 */
export async function DELETE(_request: Request, { params }: Params) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await findUser(params.userId);
  if (!user) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const conversation = await findConversationByUserId(params.userId);
  if (!conversation) {
    // Nothing to clear — no conversation row means no messages either.
    return NextResponse.json({ data: { cleared: 0 } });
  }

  const cleared = await clearConversationMessages(conversation.id);

  // waitUntil keeps the lambda alive until the audit write lands. Without it
  // Vercel can kill the function the moment the response is sent, dropping
  // the audit row mid-flight — unacceptable for destructive admin actions.
  waitUntil(
    logAuditEvent({
      adminId: session.adminId,
      adminUsername: session.username,
      action: "support.clear_conversation",
      targetType: "user",
      targetId: params.userId,
      details: JSON.stringify({
        conversationId: conversation.id,
        clientName: user.displayName,
        messagesDeleted: cleared,
      }),
    }).catch(() => {})
  );

  return NextResponse.json({ data: { cleared } });
}
