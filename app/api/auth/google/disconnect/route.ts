export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { deleteCalendarConfig } from "@/lib/google/tokenStorage";

export async function POST() {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await deleteCalendarConfig();
  return NextResponse.json({ ok: true });
}
