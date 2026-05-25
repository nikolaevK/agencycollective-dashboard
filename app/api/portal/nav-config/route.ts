export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { findUser } from "@/lib/users";

/**
 * Per-client portal nav visibility (AI Analyst + Design Board) for the sidebar.
 * Deliberately lightweight — one user row, no Meta API — so it can poll far more
 * often than the metrics `user/overview`. That keeps admin changes (granting AI
 * Analyst access, setting a Design Board link) surfacing within ~60s instead of
 * being stuck behind the overview's 5-min React Query stale window. Returns only
 * booleans, so the raw Figma URL is never shipped to a surface that just needs
 * to know whether to show the link.
 */
export async function GET() {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await findUser(session.userId);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(
    {
      data: {
        analystEnabled: user.analystEnabled,
        // Visible only when enabled AND a link is set — the page enforces the
        // same gate server-side.
        designBoardVisible: user.designBoardEnabled && Boolean(user.designBoardUrl),
      },
    },
    { headers: { "Cache-Control": "private, max-age=30" } }
  );
}
