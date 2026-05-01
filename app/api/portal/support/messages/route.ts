export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  createMessage,
  getOrCreateConversation,
  listMessagesSince,
  resolveSenders,
  MESSAGE_BODY_MAX,
} from "@/lib/conversations";
import { checkRate, rateLimitedResponse } from "@/lib/rateLimit";

/**
 * Cursor-based polling endpoint. Quiet conversations return a 200 with an
 * empty array (cheapest possible) and the same cursor — the cost of an idle
 * 20s poll is essentially one round-trip with no DB row read past the index.
 */
export async function GET(request: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = rateLimitedResponse(`support-read:client:${session.userId}`, 120);
  if (limited) return limited;

  const conversation = await getOrCreateConversation(session.userId);

  const url = new URL(request.url);
  const sinceTs = url.searchParams.get("since");
  const sinceId = url.searchParams.get("sinceId") ?? "";

  if (!sinceTs) {
    return NextResponse.json({ error: "since is required" }, { status: 400 });
  }

  const messages = await listMessagesSince(conversation.id, { createdAt: sinceTs, id: sinceId });
  const senders = messages.length > 0 ? await resolveSenders(messages) : {};
  return NextResponse.json({ data: { messages, senders } });
}

export async function POST(request: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Spam guard: 30 messages/min per client. Soft per-lambda; sufficient to
  // stop a single runaway tab without leaning on Vercel KV.
  const rate = checkRate(`chat:client:${session.userId}`, 30, 60_000);
  if (!rate.ok) {
    return NextResponse.json(
      { error: "Too many messages. Please slow down." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } }
    );
  }

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

  const conversation = await getOrCreateConversation(session.userId);
  const message = await createMessage({
    conversationId: conversation.id,
    senderType: "client",
    senderId: session.userId,
    body,
  });

  const senders = await resolveSenders([message]);
  return NextResponse.json({ data: { message, senders } }, { status: 201 });
}
