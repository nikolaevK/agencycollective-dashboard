export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { hasPermission } from "@/lib/permissions";
import { ensureMigrated } from "@/lib/db";
import { getOnboardingProgress } from "@/lib/onboarding";
import { requireClientRouteActor } from "@/lib/api/requireAdmin";

export async function GET(
  _request: Request,
  { params }: { params: { userId: string } }
) {
  await ensureMigrated();

  const guard = await requireClientRouteActor(params.userId);
  if (guard.response) return guard.response;

  if (!hasPermission(guard.actor.admin, "users")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
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
