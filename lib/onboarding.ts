import { getDb } from "./db";
import type { Row } from "@libsql/client";
import { ALL_STEP_IDS } from "./onboarding-steps";

const VALID_STEPS = new Set(ALL_STEP_IDS);

// ── Types ────────────────────────────────────────────────────────────────

export interface OnboardingStepRecord {
  userId: string;
  stepId: string;
  completed: boolean;
  completedAt: string | null;
}

// ── Row mapper ───────────────────────────────────────────────────────────

function rowToStep(row: Row): OnboardingStepRecord {
  return {
    userId: String(row.user_id),
    stepId: String(row.step_id),
    completed: Number(row.completed) === 1,
    completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}

// ── Queries ──────────────────────────────────────────────────────────────

/** Fetch all onboarding steps for a user (completed or not). */
export async function getOnboardingProgress(
  userId: string
): Promise<OnboardingStepRecord[]> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT user_id, step_id, completed, completed_at FROM onboarding_progress WHERE user_id = ?",
    args: [userId],
  });
  return result.rows.map(rowToStep);
}

/** Toggle a single step. Creates the row on first toggle. */
export async function toggleStep(
  userId: string,
  stepId: string
): Promise<OnboardingStepRecord> {
  if (!VALID_STEPS.has(stepId)) {
    throw new Error(`Invalid onboarding step: ${stepId}`);
  }

  const db = getDb();
  const now = new Date().toISOString();

  const existing = await db.execute({
    sql: "SELECT completed FROM onboarding_progress WHERE user_id = ? AND step_id = ?",
    args: [userId, stepId],
  });

  if (existing.rows[0]) {
    const wasCompleted = Number(existing.rows[0].completed) === 1;
    const newCompleted = wasCompleted ? 0 : 1;
    await db.execute({
      sql: "UPDATE onboarding_progress SET completed = ?, completed_at = ?, updated_at = ? WHERE user_id = ? AND step_id = ?",
      args: [newCompleted, newCompleted ? now : null, now, userId, stepId],
    });
    return { userId, stepId, completed: !wasCompleted, completedAt: !wasCompleted ? now : null };
  }

  // First time completing this step
  const id = `${userId}-${stepId}`;
  await db.execute({
    sql: "INSERT INTO onboarding_progress (id, user_id, step_id, completed, completed_at) VALUES (?, ?, ?, 1, ?)",
    args: [id, userId, stepId, now],
  });
  return { userId, stepId, completed: true, completedAt: now };
}
