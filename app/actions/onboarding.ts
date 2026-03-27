"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { findUser } from "@/lib/users";
import { ensureMigrated } from "@/lib/db";
import { toggleStep } from "@/lib/onboarding";

export async function toggleOnboardingStepAction(
  stepId: string
): Promise<{ error?: string; completed?: boolean }> {
  const session = getSession();
  if (!session) return { error: "Unauthorized" };

  await ensureMigrated();

  const user = await findUser(session.userId);
  if (!user) return { error: "User not found" };

  try {
    const result = await toggleStep(session.userId, stepId);
    revalidatePath(`/${user.slug}/portal/onboarding`);
    return { completed: result.completed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Toggle failed";
    return { error: msg };
  }
}
