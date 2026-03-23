export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCloserSession } from "@/lib/closerSession";
import { getDb, ensureMigrated } from "@/lib/db";

export async function GET(request: Request) {
  const session = getCloserSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ data: [] });
  }

  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT id, display_name FROM users WHERE display_name LIKE ? COLLATE NOCASE LIMIT 10",
    args: [`%${q}%`],
  });

  const clients = result.rows.map((row) => ({
    id: String(row.id),
    displayName: String(row.display_name),
  }));

  return NextResponse.json({ data: clients });
}
