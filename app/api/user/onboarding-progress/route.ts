export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { findUser } from "@/lib/users";
import { ensureMigrated } from "@/lib/db";
import { getOnboardingProgress } from "@/lib/onboarding";

export async function GET() {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureMigrated();

    const user = await findUser(session.userId);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const steps = await getOnboardingProgress(session.userId);

    const completedSteps: Record<string, { completedAt: string | null }> = {};
    for (const s of steps) {
      if (s.completed) {
        completedSteps[s.stepId] = { completedAt: s.completedAt };
      }
    }

    return NextResponse.json(
      { data: { completedSteps } },
      { headers: { "Cache-Control": "private, no-cache" } }
    );
  } catch (err) {
    console.error("[onboarding-progress] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
