export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { listReaders } from "@/lib/mediaReads";

/** Read receipts are an oversight surface — Head of Paid Media (or super) only. */
function requireMediaManager() {
  const session = getAdminSession();
  if (!session) return null;
  if (!session.isSuper && !session.permissions.media_manage) return null;
  return session;
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = requireMediaManager();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const readers = await listReaders(params.id);
    return NextResponse.json({ data: readers });
  } catch (err) {
    console.error("[admin/media-buyers/documents/readers GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
