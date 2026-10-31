/**
 * Appointment vocabulary — statuses, setter tiers, labels and badge styles.
 * Pure (no db imports) so client components can use it without pulling the
 * database client into the browser bundle; lib/appointments re-exports it.
 */

export type PreCallStatus =
  | "not_called"
  | "auto_confirmed"
  | "auto_no_answer"
  | "triaged_confirmed"
  | "confirmed"
  | "no_answer"
  | "voicemail"
  | "rescheduled"
  | "cancelled";

export type PostCallStatus =
  | "not_called"
  | "followed_up"
  | "needs_followup"
  | "qualified"
  | "disqualified"
  | "no_answer";

// Ordered for the dropdown: initial state → automation outcomes → setter's
// manual-call outcomes → prospect-driven outcomes.
export const PRE_CALL_STATUSES: PreCallStatus[] = [
  "not_called",
  "auto_confirmed",
  "auto_no_answer",
  "triaged_confirmed",
  "confirmed",
  "no_answer",
  "voicemail",
  "rescheduled",
  "cancelled",
];

export const POST_CALL_STATUSES: PostCallStatus[] = [
  "not_called",
  "followed_up",
  "needs_followup",
  "qualified",
  "disqualified",
  "no_answer",
];

// 1099 contract tiers (Section 3.3). The setter declares which tier their
// contribution falls under; null means "no tier selected → no credit on
// any linked deal." This is what replaces the old auto-attribution.
export type SetterTier = "A" | "B" | "C" | "D";
export const SETTER_TIERS: SetterTier[] = ["A", "B", "C", "D"];

export function isSetterTier(v: unknown): v is SetterTier {
  return typeof v === "string" && (SETTER_TIERS as string[]).includes(v);
}

export function isPreCallStatus(v: unknown): v is PreCallStatus {
  return typeof v === "string" && (PRE_CALL_STATUSES as string[]).includes(v);
}

export function isPostCallStatus(v: unknown): v is PostCallStatus {
  return typeof v === "string" && (POST_CALL_STATUSES as string[]).includes(v);
}

// ── Shared UI labels + badge styling ──────────────────────────────────────
// Kept here (not in a component file) so every surface — setter portal,
// closer calendar, admin calendar — renders identical strings and colors.

export const PRE_CALL_LABELS: Record<PreCallStatus, string> = {
  not_called: "Not called",
  auto_confirmed: "Not triaged / Confirmed via text",
  auto_no_answer: "No answer / Not confirmed via text",
  triaged_confirmed: "Triaged / Call confirmed",
  confirmed: "Confirmed",
  no_answer: "No answer on call",
  voicemail: "Voicemail",
  rescheduled: "Rescheduled",
  cancelled: "Cancelled",
};

export const POST_CALL_LABELS: Record<PostCallStatus, string> = {
  not_called: "Not called",
  followed_up: "Followed up",
  needs_followup: "Needs follow-up",
  qualified: "Qualified",
  disqualified: "Disqualified",
  no_answer: "No answer",
};

export const PRE_CALL_BADGE: Record<PreCallStatus, string> = {
  not_called: "bg-muted/60 text-muted-foreground",
  auto_confirmed: "bg-teal-500/15 text-teal-700 dark:text-teal-400",
  auto_no_answer: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  triaged_confirmed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  confirmed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  no_answer: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  voicemail: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  rescheduled: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400",
  cancelled: "bg-red-500/15 text-red-700 dark:text-red-400",
};

export const POST_CALL_BADGE: Record<PostCallStatus, string> = {
  not_called: "bg-muted/60 text-muted-foreground",
  followed_up: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  needs_followup: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  qualified: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  disqualified: "bg-red-500/15 text-red-700 dark:text-red-400",
  no_answer: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
};

// ── Tier metadata for UI consumption ─────────────────────────────────
// Centralized so the setter calendar, setter dashboard, admin deal view,
// and audit log all describe each tier identically.

export const SETTER_TIER_LABELS: Record<SetterTier, string> = {
  A: "Tier A — Setter-Sourced",
  B: "Tier B — Setter-Recovered",
  C: "Tier C — Setter-Confirmed (Self-Booked)",
  D: "Tier D — System-Nurtured",
};

/** One-line summary of how each tier pays. Surfaced next to the picker. */
export const SETTER_TIER_PAYOUT_HINT: Record<SetterTier, string> = {
  A: "3% of collected gross revenue",
  B: "2% of collected gross revenue",
  C: "$25 flat per attended call (≥ 2 min)",
  D: "No commission",
};

export const SETTER_TIER_BADGE: Record<SetterTier, string> = {
  A: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  B: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  C: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  D: "bg-muted/60 text-muted-foreground",
};
