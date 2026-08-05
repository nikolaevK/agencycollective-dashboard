export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { getAdminTotalUnreadCount, listAdminInbox } from "@/lib/conversations";
import { readUsers } from "@/lib/users";
import { getScopeForAdminId } from "@/lib/api/supportScope";
import { inWorkspaceScope } from "@/lib/workspaces";
import { rateLimitedResponse } from "@/lib/rateLimit";

/**
 * Single int — drives the admin sidebar Support badge. Sums unread across
 * all client conversations (per-admin unread isn't a thing here; any admin
 * reading clears the count for the team).
 */
export async function GET() {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = rateLimitedResponse(`support-read:admin:${session.adminId}`, 180);
  if (limited) return limited;

  const scope = await getScopeForAdminId(session.adminId);
  if (scope === undefined) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (scope === null) {
    const count = await getAdminTotalUnreadCount();
    return NextResponse.json({ data: { count } });
  }
  // Scoped actors: sum unread over their book(s) only (the global aggregate
  // would leak activity volume from other books).
  const [inbox, users] = await Promise.all([listAdminInbox(), readUsers()]);
  const workspaceById = new Map(users.map((u) => [u.id, u.workspace]));
  const count = inbox
    .filter((e) => inWorkspaceScope(scope, workspaceById.get(e.userId) ?? "main"))
    .reduce((sum, e) => sum + e.unreadCount, 0);
  return NextResponse.json({ data: { count } });
}
