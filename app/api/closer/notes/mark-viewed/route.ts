export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCloserSession } from "@/lib/closerSession";
import { markNotesViewed } from "@/lib/notes";

/**
 * Stamps the user's last notes-page visit. Called from the notes board
 * whenever data loads/refetches so the sidebar badge clears while they're
 * on the page. Idempotent; repeated calls just bump the timestamp.
 */
export async function POST() {
  const session = getCloserSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await markNotesViewed(session.closerId);
  return NextResponse.json({ data: { ok: true } });
}
