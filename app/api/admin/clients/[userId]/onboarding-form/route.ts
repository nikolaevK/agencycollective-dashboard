export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireClientRouteActor } from "@/lib/api/requireAdmin";
import { getClientOnboarding } from "@/lib/clientOnboarding";
import { countAnswered } from "@/lib/onboardingForm";

/**
 * The client's onboarding questionnaire, read-only for admins (client detail
 * → Onboarding tab). `data` is null until the client first saves it.
 * Answers are released only once the client SUBMITS — a draft reports
 * progress (`answeredCount`) with `answers: null`, enforced here rather than
 * just in the UI. Gated by `users` via middleware; workspace-scoped here.
 */
export async function GET(_request: Request, { params }: { params: { userId: string } }) {
  const guard = await requireClientRouteActor(params.userId);
  if (guard.response) return guard.response;
  try {
    const record = await getClientOnboarding(params.userId);
    const data = record && {
      ...record,
      answers: record.status === "submitted" ? record.answers : null,
      answeredCount: countAnswered(record.answers),
    };
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-cache" } });
  } catch (err) {
    console.error("[admin/onboarding-form GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
