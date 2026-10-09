import { getDb, ensureMigrated } from "./db";
import type { InStatement, Row } from "@libsql/client";
import {
  normalizeOnboardingAnswers,
  type OnboardingAnswers,
  type OnboardingStatus,
} from "./onboardingForm";

// ---------------------------------------------------------------------------
// Client onboarding questionnaire persistence. Normalized across three tables
// (lib/db.ts CRITICAL_TABLE_DDL):
//   client_onboarding            — one row of scalar answers per client
//   client_onboarding_selections — (user_id, question, value) per multi-select tick
//   client_onboarding_access     — (user_id, platform, status) per platform
// A save rewrites all three for the client in ONE atomic write batch, so a
// reader never sees a half-saved form. Autosaves keep the status; a submit
// flips it to 'submitted' and stamps submitted_at (re-submits restamp it).
// ---------------------------------------------------------------------------

export interface OnboardingRecord {
  status: OnboardingStatus;
  answers: OnboardingAnswers;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** answers key → client_onboarding column. */
const SCALAR_COLUMNS: [keyof OnboardingAnswers, string][] = [
  ["brandName", "brand_name"],
  ["website", "website"],
  ["heroProduct", "hero_product"],
  ["mainContact", "main_contact"],
  ["adApprover", "ad_approver"],
  ["monthlyRevenue", "monthly_revenue"],
  ["adSpendNowCents", "ad_spend_now_cents"],
  ["roasNow", "roas_now"],
  ["adSpendStartCents", "ad_spend_start_cents"],
  ["adSpend90dCents", "ad_spend_90d_cents"],
  ["primaryGoal", "primary_goal"],
  ["target", "target"],
  ["win90d", "win_90d"],
  ["aovCents", "aov_cents"],
  ["cogsCents", "cogs_cents"],
  ["shippingCents", "shipping_cents"],
  ["fulfillmentCents", "fulfillment_cents"],
  ["processingBps", "processing_bps"],
  ["otherCents", "other_cents"],
  ["refundsBps", "refunds_bps"],
  ["repeatPurchase", "repeat_purchase"],
  ["storePlatform", "store_platform"],
  ["accessContact", "access_contact"],
  ["websiteManager", "website_manager"],
  ["assetsUrl", "assets_url"],
  ["notes", "notes"],
];

/** Multi-select answers stored in client_onboarding_selections. */
const SELECTION_QUESTIONS = ["sells", "channels"] as const;

function isNoSuchTable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /no such table/i.test(msg);
}

export async function getClientOnboarding(userId: string): Promise<OnboardingRecord | null> {
  await ensureMigrated();
  const db = getDb();
  let main: Row | undefined;
  let selections: Row[];
  let access: Row[];
  try {
    const [r1, r2, r3] = await db.batch(
      [
        {
          sql: `SELECT status, submitted_at, created_at, updated_at,
                       ${SCALAR_COLUMNS.map(([, c]) => c).join(", ")}
                FROM client_onboarding WHERE user_id = ?`,
          args: [userId],
        },
        {
          sql: "SELECT question, value FROM client_onboarding_selections WHERE user_id = ?",
          args: [userId],
        },
        {
          sql: "SELECT platform, status FROM client_onboarding_access WHERE user_id = ?",
          args: [userId],
        },
      ],
      "read"
    );
    main = r1.rows[0];
    selections = [...r2.rows];
    access = [...r3.rows];
  } catch (err) {
    if (isNoSuchTable(err)) return null;
    throw err;
  }
  if (!main) return null;

  // Re-run the stored values through the normalizer: a vocabulary change
  // (a removed option) degrades to "unanswered" instead of a stray slug.
  const raw: Record<string, unknown> = {};
  for (const [key, col] of SCALAR_COLUMNS) {
    const v = main[col];
    raw[key] = v == null ? null : typeof v === "string" ? v : Number(v);
  }
  for (const qk of SELECTION_QUESTIONS) {
    raw[qk] = selections.filter((r) => String(r.question) === qk).map((r) => String(r.value));
  }
  raw.access = Object.fromEntries(access.map((r) => [String(r.platform), String(r.status)]));

  return {
    status: String(main.status) === "submitted" ? "submitted" : "draft",
    answers: normalizeOnboardingAnswers(raw),
    submittedAt: main.submitted_at != null ? String(main.submitted_at) : null,
    createdAt: String(main.created_at ?? ""),
    updatedAt: String(main.updated_at ?? ""),
  };
}

/**
 * Save the full answer set (autosave or submit). `rawAnswers` is untrusted
 * and normalized here. Returns the stored record.
 */
export async function saveClientOnboarding(
  userId: string,
  rawAnswers: unknown,
  opts: { submit: boolean }
): Promise<OnboardingRecord> {
  await ensureMigrated();
  const db = getDb();
  const answers = normalizeOnboardingAnswers(rawAnswers);
  const now = new Date().toISOString();

  const cols = SCALAR_COLUMNS.map(([, c]) => c);
  // Blank text → NULL so "unanswered" reads the same in SQL as in the app.
  const values = SCALAR_COLUMNS.map(([k]) => {
    const v = answers[k] as string | number | null;
    return v === "" ? null : v;
  });

  const statements: InStatement[] = [
    {
      sql: `INSERT INTO client_onboarding
              (user_id, status, submitted_at, created_at, updated_at, ${cols.join(", ")})
            VALUES (?, ?, ?, ?, ?, ${cols.map(() => "?").join(", ")})
            ON CONFLICT(user_id) DO UPDATE SET
              ${cols.map((c) => `${c} = excluded.${c}`).join(",\n              ")},
              status = CASE WHEN excluded.status = 'submitted'
                            THEN 'submitted' ELSE client_onboarding.status END,
              submitted_at = COALESCE(excluded.submitted_at, client_onboarding.submitted_at),
              updated_at = excluded.updated_at`,
      args: [
        userId,
        opts.submit ? "submitted" : "draft",
        opts.submit ? now : null,
        now,
        now,
        ...values,
      ],
    },
    { sql: "DELETE FROM client_onboarding_selections WHERE user_id = ?", args: [userId] },
    { sql: "DELETE FROM client_onboarding_access WHERE user_id = ?", args: [userId] },
  ];

  const selectionRows = SELECTION_QUESTIONS.flatMap((qk) =>
    answers[qk].map((value) => [userId, qk, value])
  );
  if (selectionRows.length > 0) {
    statements.push({
      sql: `INSERT INTO client_onboarding_selections (user_id, question, value)
            VALUES ${selectionRows.map(() => "(?, ?, ?)").join(", ")}`,
      args: selectionRows.flat(),
    });
  }
  const accessRows = Object.entries(answers.access).map(([platform, status]) => [
    userId,
    platform,
    status,
  ]);
  if (accessRows.length > 0) {
    statements.push({
      sql: `INSERT INTO client_onboarding_access (user_id, platform, status)
            VALUES ${accessRows.map(() => "(?, ?, ?)").join(", ")}`,
      args: accessRows.flat(),
    });
  }

  // Read the merged status back inside the same transaction (saves a round
  // trip on every autosave).
  statements.push({
    sql: "SELECT status, submitted_at, created_at, updated_at FROM client_onboarding WHERE user_id = ?",
    args: [userId],
  });

  const results = await db.batch(statements, "write");
  const row = results[results.length - 1]?.rows[0];
  return {
    status: row && String(row.status) === "submitted" ? "submitted" : opts.submit ? "submitted" : "draft",
    answers,
    submittedAt: row?.submitted_at != null ? String(row.submitted_at) : opts.submit ? now : null,
    createdAt: row?.created_at != null ? String(row.created_at) : now,
    updatedAt: now,
  };
}
