export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCloserSession } from "@/lib/closerSession";
import { readClosers } from "@/lib/closers";

/**
 * Team directory for the share picker: every active user a note can be
 * shared WITH (closers + setters, excluding self and inactive accounts).
 * No email — only id, display name, role — because we only need to render
 * a list to select.
 */
export async function GET() {
  const session = getCloserSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const all = await readClosers();
  const targets = all
    .filter((c) => c.status === "active" && c.id !== session.closerId)
    .map((c) => ({
      id: c.id,
      displayName: c.displayName,
      role: c.role,
    }));

  return NextResponse.json({ data: targets });
}
