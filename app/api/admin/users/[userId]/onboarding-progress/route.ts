export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { hasPermission } from "@/lib/permissions";
import { ensureMigrated } from "@/lib/db";
import { getOnboardingProgress } from "@/lib/onboarding";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(
  _request: Request,
  { params }: { params: { userId: string } }
) {
  const session = getAdminSession();
  if (!session) return unauthorized();

  const admin = await findAdmin(session.adminId);
  if (!admin) return unauthorized();

  if (!hasPermission(admin, "users")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await ensureMigrated();

    const steps = await getOnboardingProgress(params.userId);

    const completedSteps: Record<string, { completedAt: string | null }> = {};
    for (const s of steps) {
      if (s.completed) {
        completedSteps[s.stepId] = { completedAt: s.completedAt };
      }
    }

    return NextResponse.json(
      { data: { completedSteps } },
      { headers: { "Cache-Control": "private, max-age=30" } }
    );
  } catch (err) {
    console.error("[admin/onboarding-progress] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
