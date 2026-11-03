/**
 * Pure selection / budgeting rules for the AI Analyst's Meta data context
 * (split from lib/analyst/context.ts so they're testable without the Meta
 * and db layers).
 */

import type { CampaignRow } from "@/types/dashboard";

const CAMPAIGNS_PER_ACCOUNT = 10;
const SELECTED_CAMPAIGNS_PER_ACCOUNT = 20;

export const bySpend = <T extends { insights: { spend: number } }>(a: T, b: T) => b.insights.spend - a.insights.spend;

/**
 * Which campaigns to describe for an account: the user's explicitly selected
 * ones (any status — someone who ticks a paused campaign wants it analyzed),
 * else the top active ones by spend; for an explicitly selected account with
 * no active campaigns, its top campaigns of any status.
 */
export function pickCampaigns(
  campaigns: CampaignRow[],
  selectedCampaignIds: Set<string>,
  accountExplicitlySelected: boolean
): CampaignRow[] {
  const selected = campaigns.filter((c) => selectedCampaignIds.has(c.id));
  if (selected.length > 0) return [...selected].sort(bySpend).slice(0, SELECTED_CAMPAIGNS_PER_ACCOUNT);
  const active = campaigns.filter((c) => c.status === "ACTIVE").sort(bySpend);
  if (active.length > 0 || !accountExplicitlySelected) return active.slice(0, CAMPAIGNS_PER_ACCOUNT);
  return [...campaigns].sort(bySpend).slice(0, CAMPAIGNS_PER_ACCOUNT);
}

/** Join parts and cut at a part boundary once over budget. */
export function joinWithinBudget(parts: string[], maxChars: number): string {
  const out: string[] = [];
  let used = 0;
  for (const part of parts) {
    if (used + part.length + 1 > maxChars) {
      out.push("\n[Context truncated — select specific accounts or campaigns for more detail]");
      break;
    }
    out.push(part);
    used += part.length + 1;
  }
  return out.join("\n");
}
