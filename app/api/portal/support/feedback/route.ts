export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  createFeedback,
  listFeedbackByUser,
  getRepliesForFeedbackIds,
  isSentiment,
  FEEDBACK_BODY_MAX,
} from "@/lib/feedback";
import { checkRate, rateLimitedResponse } from "@/lib/rateLimit";

export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = rateLimitedResponse(`support-read:client:${session.userId}`, 120);
  if (limited) return limited;

  const feedback = await listFeedbackByUser(session.userId);
  const replies = await getRepliesForFeedbackIds(feedback.map((f) => f.id));
  return NextResponse.json({
    data: feedback.map((f) => ({ ...f, replies: replies[f.id] ?? [] })),
  });
}

export async function POST(request: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Feedback should be deliberate, not spammed. 5/min/client is generous.
  const rate = checkRate(`feedback:client:${session.userId}`, 5, 60_000);
  if (!rate.ok) {
    return NextResponse.json(
      { error: "Too many submissions. Please wait before sending more feedback." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } }
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isSentiment(payload.sentiment)) {
    return NextResponse.json({ error: "Invalid sentiment" }, { status: 400 });
  }
  const rating = Number(payload.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "rating must be an integer 1-5" }, { status: 400 });
  }
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (body.length > FEEDBACK_BODY_MAX) {
    return NextResponse.json({ error: `body must be ${FEEDBACK_BODY_MAX} characters or fewer` }, { status: 400 });
  }

  const feedback = await createFeedback({
    userId: session.userId,
    sentiment: payload.sentiment,
    rating,
    body,
  });
  return NextResponse.json({ data: { ...feedback, replies: [] } }, { status: 201 });
}
