export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { getCloserSession } from "@/lib/closerSession";
import { isCalendarConnected } from "@/lib/google/tokenStorage";

export async function GET() {
  // Allow both admin and closer sessions
  const adminSession = getAdminSession();
  const closerSession = getCloserSession();

  if (!adminSession && !closerSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await isCalendarConnected();
  return NextResponse.json({ data: status });
}
