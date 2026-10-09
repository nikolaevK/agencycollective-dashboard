export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requirePortalUser } from "@/lib/api/requirePortalUser";
import { readJsonCapped } from "@/lib/api/readBodyCapped";
import { getClientOnboarding, saveClientOnboarding } from "@/lib/clientOnboarding";
import { emptyAnswers, normalizeOnboardingAnswers } from "@/lib/onboardingForm";

/**
 * The signed-in client's onboarding questionnaire (portal → Onboarding →
 * Questionnaire). GET returns the saved answers — or a blank form with the
 * brand name pre-filled. PUT saves the full answer set: autosave by default,
 * `submit: true` hands it to the agency (admins see it under the client).
 */
export async function GET() {
  const guard = await requirePortalUser();
  if (guard.response) return guard.response;
  const { user } = guard;
  try {
    const record = await getClientOnboarding(user.id);
    return NextResponse.json(
      {
        data: record ?? {
          status: "draft",
          answers: { ...emptyAnswers(), brandName: user.displayName },
          submittedAt: null,
          createdAt: null,
          updatedAt: null,
        },
      },
      { headers: { "Cache-Control": "private, no-cache" } }
    );
  } catch (err) {
    console.error("[portal/onboarding-form GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const guard = await requirePortalUser();
  if (guard.response) return guard.response;
  const { user } = guard;
  // Every answer is length-capped on save; 64 KB is far above a full form.
  const parsed = await readJsonCapped(request, 64 * 1024);
  if (!parsed.ok) {
    return parsed.reason === "too_large"
      ? NextResponse.json({ error: "Request body too large" }, { status: 413 })
      : NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = (parsed.value ?? {}) as { answers?: unknown; submit?: unknown };
  const submit = body.submit === true;
  if (submit && !normalizeOnboardingAnswers(body.answers).brandName) {
    return NextResponse.json({ error: "Add your brand name before submitting." }, { status: 400 });
  }
  try {
    const record = await saveClientOnboarding(user.id, body.answers, { submit });
    return NextResponse.json({ data: record });
  } catch (err) {
    console.error("[portal/onboarding-form PUT]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
