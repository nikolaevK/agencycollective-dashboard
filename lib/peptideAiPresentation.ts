// Pure Peptide AI vocabulary shared by the portal tab and the admin views — no
// db imports, safe in client components. The server side is lib/peptideAi.ts.

export const PEPTIDE_AI_DEFAULT_CAP_CENTS = 5000;
/** Share of the budget used at which the client is warned. */
export const PEPTIDE_AI_WARN_SHARE = 0.8;

/** Why a client can't use Peptide AI right now. */
export type PeptideAiOffReason = "disabled" | "churned" | "paused";

/** One client's account in Peptide AI, as its partner API reports it. */
export type PeptideAiUsage =
  | { clientId: string; provisioned: false }
  | {
      clientId: string;
      provisioned: true;
      /** 'active' | 'suspended' | 'banned' — Peptide AI's own account status. */
      status: string;
      /** Who switched it off: this dashboard ('agency') or a Peptide AI admin ('admin'). */
      suspendedBy: "agency" | "admin" | null;
      name: string | null;
      capCents: number;
      anchorDay: number | null;
      spentCents: number;
      /** UTC "YYYY-MM-DD HH:MM:SS" — the current cycle. */
      periodStart: string | null;
      periodEnd: string | null;
      lastActiveAt: string | null;
      createdAt: string;
    };

export type PeptideAiState =
  | "off" // switched off here (admin, churned or paused)
  | "unknown" // Peptide AI didn't answer
  | "never_opened" // never launched — no account there yet
  | "not_used" // launched, nothing spent yet
  | "blocked" // suspended or banned on Peptide AI's side
  | "active"
  | "near_cap"
  | "capped";

export function peptideAiState(enabled: boolean, usage: PeptideAiUsage | null | undefined): PeptideAiState {
  if (!enabled) return "off";
  if (!usage) return "unknown";
  if (!usage.provisioned) return "never_opened";
  if (usage.status !== "active") return "blocked";
  if (usage.spentCents >= usage.capCents) return "capped";
  if (usage.spentCents >= usage.capCents * PEPTIDE_AI_WARN_SHARE) return "near_cap";
  if (!usage.lastActiveAt) return "not_used";
  return "active";
}

export const PEPTIDE_AI_STATE_LABEL: Record<PeptideAiState, string> = {
  off: "Off",
  unknown: "Unavailable",
  never_opened: "Never opened",
  not_used: "Not used yet",
  blocked: "Blocked in Peptide AI",
  active: "Active",
  near_cap: "Near limit",
  capped: "Limit reached",
};

export const PEPTIDE_AI_OFF_REASON_LABEL: Record<PeptideAiOffReason, string> = {
  disabled: "Switched off",
  churned: "Client inactive",
  paused: "Billing paused",
};

/** "$12.40" — whole cents; real spend under a cent reads "<$0.01", not "$0.00". */
export function formatUsd(cents: number): string {
  if (cents > 0 && cents < 1) return "<$0.01";
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "Nov 14, 2026" — a cycle boundary is 00:00 UTC, so its date is the UTC one. */
export function formatCycleDate(ts: string): string {
  const d = new Date(ts.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime())
    ? ts
    : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/** "14th" — for "resets on the 14th of each month" before the first launch. */
export function ordinalDay(day: number): string {
  const tens = day % 100;
  const suffix =
    tens >= 11 && tens <= 13 ? "th" : day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th";
  return `${day}${suffix}`;
}
