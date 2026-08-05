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
import { readUsers } from "@/lib/users";
import { getScopeForAdminId } from "@/lib/api/supportScope";
import { inWorkspaceScope } from "@/lib/workspaces";

export async function GET(request: Request) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = rateLimitedResponse(`support-read:admin:${session.adminId}`, 180);
  if (limited) return limited;

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const userId = url.searchParams.get("userId") ?? undefined;
  const status: FeedbackStatus | undefined = isFeedbackStatus(statusParam) ? statusParam : undefined;

  const scope = await getScopeForAdminId(session.adminId);
  if (scope === undefined) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let feedback = await listAllFeedback({ status, userId });
  if (scope !== null) {
    // Workspace scoping: only feedback from clients in the actor's book(s).
    const workspaceById = new Map((await readUsers()).map((u) => [u.id, u.workspace]));
    feedback = feedback.filter((f) =>
      inWorkspaceScope(scope, workspaceById.get(f.userId) ?? "main")
    );
  }
  const replies = await getRepliesForFeedbackIds(feedback.map((f) => f.id));

  return NextResponse.json({
    data: feedback.map((f) => ({ ...f, replies: replies[f.id] ?? [] })),
  });
}
