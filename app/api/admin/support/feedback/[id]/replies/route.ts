export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import {
  createReply,
  findFeedback,
  REPLY_BODY_MAX,
} from "@/lib/feedback";
import { checkRate } from "@/lib/rateLimit";

interface Params { params: { id: string } }

export async function POST(request: Request, { params }: Params) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rate = checkRate(`feedback-reply:admin:${session.adminId}`, 30, 60_000);
  if (!rate.ok) {
    return NextResponse.json(
      { error: "Too many replies. Please slow down." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } }
    );
  }

  const existing = await findFeedback(params.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const body = String(payload.body ?? "").trim();
  if (!body) return NextResponse.json({ error: "body is required" }, { status: 400 });
  if (body.length > REPLY_BODY_MAX) {
    return NextResponse.json({ error: `body must be ${REPLY_BODY_MAX} characters or fewer` }, { status: 400 });
  }

  const reply = await createReply({
    feedbackId: params.id,
    adminId: session.adminId,
    body,
  });
  return NextResponse.json({ data: reply }, { status: 201 });
}
