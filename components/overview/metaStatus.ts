import type { BadgeTone } from "@/components/ui/badge";

// Meta delivery / account statuses → status-chip tone. Inactive states are
// neutral (not red); red is for states that block delivery.
const TONES: Record<string, BadgeTone> = {
  ACTIVE: "success",
  DISABLED: "danger",
  UNSETTLED: "danger",
  WITH_ISSUES: "danger",
  DISAPPROVED: "danger",
  PENDING_RISK_REVIEW: "warning",
  IN_GRACE_PERIOD: "warning",
  PENDING_BILLING_INFO: "warning",
  IN_PROCESS: "info",
  PENDING_REVIEW: "info",
  PREAPPROVED: "info",
};

const LABELS: Record<string, string> = {
  PENDING_RISK_REVIEW: "Review",
  IN_GRACE_PERIOD: "Grace",
};

export function metaStatusTone(status: string): BadgeTone {
  return TONES[status] ?? "neutral";
}

/** "CAMPAIGN_PAUSED" → "Campaign paused". */
export function metaStatusLabel(status: string): string {
  if (LABELS[status]) return LABELS[status];
  const words = status.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
