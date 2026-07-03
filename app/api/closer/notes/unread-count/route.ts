export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getActiveCloserSession } from "@/lib/closerGuards";
import { getUnreadSharedNotesCount } from "@/lib/notes";

/**
 * Unread shared-notes count for the current user. Drives the sidebar badge.
 * Active shares created after the user's last notes-page visit are "unread";
 * archived shares never count.
 */
export async function GET() {
  const session = await getActiveCloserSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const count = await getUnreadSharedNotesCount(session.closerId);
  return NextResponse.json({ data: { count } });
}
