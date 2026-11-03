/**
 * Builds the AI Analyst's Meta data context (server-only). Every Meta read
 * goes through the existing cached layer (lib/meta → 24h persistent cache;
 * campaigns / ad sets / ads also through the L1 cache) — the same calls the
 * route always made, fetched per account in parallel (at most
 * META_CONCURRENCY at a time — a cold cache means ~30 Graph calls), and with
 * per-account failures reported in the context instead of failing the whole
 * request.
 *
 * Accounts are listed by spend, highest first, and each section has its own
 * size budget, so a long account list can't crowd out the campaign detail
 * fetched for the top spenders. The scope line says what actually made it in.
 *
 * Output formatting (lib/chatContext formatters) is unchanged.
 */

import { fetchCampaigns, fetchAdSets, fetchAds } from "@/lib/meta/endpoints";
import {
  fetchDemographicBreakdown,
  fetchPlacementBreakdown,
  fetchAdSetLearningStages,
  fetchCustomConversions,
  fetchConversionBreakdown,
  formatDemographicTable,
  formatPlacementTable,
  formatLearningStages,
  formatConversionBreakdown,
} from "@/lib/meta/chatEndpoints";
import { transformCampaign, transformAdSet, transformAd } from "@/lib/meta/transformers";
import cache, { CacheKeys, TTL } from "@/lib/cache";
import { dateRangeCacheKey } from "@/lib/utils";
import {
  formatAccountContext,
  formatCampaignContext,
  formatAdSetContext,
  getAccountSummaries,
} from "@/lib/chatContext";
import type { DateRangeInput } from "@/types/api";
import type { AccountSummary, AdRow, AdSetRow, CampaignRow } from "@/types/dashboard";
import { bySpend, pickCampaigns } from "@/lib/analyst/contextRules";

/** ~12k tokens — cached, so a fuller picture costs little per request. */
export const MAX_CONTEXT_CHARS = 48_000;
/** MAX_CONTEXT_CHARS split per section (each cut on its own, at an account boundary). */
const SECTION_BUDGETS = {
  activeAccounts: 10_000,
  inactiveAccounts: 2_000,
  campaigns: 17_000,
  adSets: 7_000,
  breakdowns: 12_000,
};
const ENRICH_CAMPAIGN_ACCOUNTS = 5;
const ENRICH_DEEP_ACCOUNTS = 3;
const ADSET_CAMPAIGNS = 3;
const ADSETS_PER_CAMPAIGN = 3;
/** Meta reads in flight at once while building the context. */
export const META_CONCURRENCY = 5;

export interface AnalystContextInput {
  dateRange: DateRangeInput;
  selectedAccountIds: string[];
  selectedCampaignIds: string[];
  onStatus?: (message: string) => void;
}

export interface AnalystContext {
  contextText: string;
  scope: string;
  /** Every account the token can see (generate_report may only target these). */
  knownAccountIds: Set<string>;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type Limit = <T>(task: () => Promise<T>) => Promise<T>;

/** Runs at most `max` tasks at once; the rest wait in order (a finishing task hands its slot over). */
function createLimiter(max: number): Limit {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async (task) => {
    if (active < max) active++;
    else await new Promise<void>((resolve) => waiting.push(resolve));
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

/** The leading parts that fit in `maxChars` (cut at a part boundary, with a notice) and how many made it. */
function fitParts(parts: string[], maxChars: number): { text: string; included: number } {
  let used = 0;
  let included = 0;
  for (const part of parts) {
    if (used + part.length + 1 > maxChars) break;
    used += part.length + 1;
    included++;
  }
  const kept = parts.slice(0, included);
  if (included < parts.length) kept.push("\n[Context truncated — select specific accounts or campaigns for more detail]");
  return { text: kept.join("\n"), included };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

async function getCampaignRows(accountId: string, dateRange: DateRangeInput, dateKey: string, limit: Limit): Promise<CampaignRow[]> {
  const key = CacheKeys.campaigns(accountId) + `:${dateKey}`;
  const cached = cache.get<CampaignRow[]>(key);
  if (cached) return cached;
  const rows = (await limit(() => fetchCampaigns(accountId, dateRange))).map(transformCampaign);
  cache.set(key, rows, TTL.CAMPAIGNS);
  return rows;
}

async function getAdSetRows(campaignId: string, dateRange: DateRangeInput, dateKey: string, limit: Limit): Promise<AdSetRow[]> {
  const key = `adsets:${campaignId}:${dateKey}`;
  const cached = cache.get<AdSetRow[]>(key);
  if (cached) return cached;
  const rows = (await limit(() => fetchAdSets(campaignId, dateRange))).map(transformAdSet);
  cache.set(key, rows, TTL.CAMPAIGNS);
  return rows;
}

async function getAdRows(adSetId: string, dateRange: DateRangeInput, dateKey: string, limit: Limit): Promise<AdRow[]> {
  const key = `ads:${adSetId}:${dateKey}`;
  const cached = cache.get<AdRow[]>(key);
  if (cached) return cached;
  const rows = (await limit(() => fetchAds(adSetId, dateRange))).map(transformAd);
  cache.set(key, rows, TTL.CAMPAIGNS);
  return rows;
}

export async function buildAnalystContext(input: AnalystContextInput): Promise<AnalystContext> {
  const { dateRange, onStatus } = input;
  const dateKey = dateRangeCacheKey(dateRange);
  const selectedAccounts = new Set(input.selectedAccountIds);
  const selectedCampaigns = new Set(input.selectedCampaignIds);
  const limit = createLimiter(META_CONCURRENCY);

  onStatus?.("Loading account data…");
  const summaries = await getAccountSummaries(dateRange);
  const knownAccountIds = new Set(summaries.map((a) => a.id));
  const byId = new Map(summaries.map((a) => [a.id, a]));

  // Highest spend first everywhere: whatever a budget cuts is the low-spend tail.
  const contextAccounts = (
    selectedAccounts.size > 0
      ? summaries.filter((a) => selectedAccounts.has(a.id))
      : summaries.filter((a) => a.status === "ACTIVE")
  ).sort(bySpend);
  const activeAccounts = contextAccounts.filter((a) => a.status === "ACTIVE");
  const inactiveAccounts = contextAccounts.filter((a) => a.status !== "ACTIVE");

  const sections: string[] = [];
  const active = fitParts(activeAccounts.map(formatAccountContext), SECTION_BUDGETS.activeAccounts);
  sections.push(`## ACTIVE Ad Accounts (${activeAccounts.length} currently running)\n`);
  sections.push(activeAccounts.length > 0 ? active.text : "No active accounts in this selection.");
  const inactive = fitParts(inactiveAccounts.map(formatAccountContext), SECTION_BUDGETS.inactiveAccounts);
  if (inactiveAccounts.length > 0) {
    sections.push(`\n## INACTIVE / PAUSED Ad Accounts (${inactiveAccounts.length} — NOT currently running)\n`);
    sections.push("These accounts are not active; their data is historical only. Keep them out of performance rankings unless the user asks about them.\n");
    sections.push(inactive.text);
  }

  // Accounts to enrich: the selection, else the top active accounts by spend.
  const enrichIds = (selectedAccounts.size > 0 ? contextAccounts : activeAccounts)
    .map((a) => a.id)
    .slice(0, ENRICH_CAMPAIGN_ACCOUNTS);
  const deepIds = enrichIds.filter((id) => byId.get(id)?.status === "ACTIVE").slice(0, ENRICH_DEEP_ACCOUNTS);

  if (enrichIds.length > 0) {
    onStatus?.(`Loading campaigns${deepIds.length > 0 ? ", ad sets and breakdowns" : ""} for ${enrichIds.length} account${enrichIds.length === 1 ? "" : "s"}…`);
  }

  // ── Campaigns (parallel per account) ──
  const campaignResults = await Promise.all(
    enrichIds.map(async (id) => {
      try {
        return { id, campaigns: await getCampaignRows(id, dateRange, dateKey, limit) };
      } catch (err) {
        console.warn(`[analyst] campaigns for ${id} failed:`, errText(err));
        return { id, campaigns: null as CampaignRow[] | null };
      }
    })
  );
  const campaignsByAccount = new Map(campaignResults.map((r) => [r.id, r.campaigns]));

  // One part per account, so the section is cut at an account boundary.
  const campaignParts: string[] = [];
  const campaignPartHasDetail: boolean[] = [];
  for (const id of enrichIds) {
    const account = byId.get(id);
    const name = account?.name ?? id;
    const currency = account?.currency ?? "USD";
    const campaigns = campaignsByAccount.get(id);
    if (!campaigns) {
      campaignParts.push(`\n**${name}** campaigns: unavailable (Meta request failed).`);
      campaignPartHasDetail.push(false);
      continue;
    }
    const picked = pickCampaigns(campaigns, selectedCampaigns, selectedAccounts.has(id));
    if (picked.length === 0) continue;
    campaignParts.push(
      [`\n**${name}** campaigns (${picked.length} shown, by spend):`, ...picked.map((c) => formatCampaignContext(c, currency))].join("\n")
    );
    campaignPartHasDetail.push(true);
  }
  const campaignsFit = fitParts(campaignParts, SECTION_BUDGETS.campaigns);
  const campaignAccountsShown = campaignPartHasDetail.slice(0, campaignsFit.included).filter(Boolean).length;
  if (campaignParts.length > 0) sections.push("\n## Campaigns\n", campaignsFit.text);

  // ── Ad sets + ads, and breakdowns (parallel per account) ──
  const deep = await Promise.all(
    deepIds.map(async (id) => {
      const account = byId.get(id) as AccountSummary;
      const currency = account.currency ?? "USD";
      const campaigns = campaignsByAccount.get(id) ?? [];
      const adSetCampaigns = pickCampaigns(campaigns, selectedCampaigns, false)
        .filter((c) => c.status === "ACTIVE" || selectedCampaigns.has(c.id))
        .slice(0, ADSET_CAMPAIGNS);

      const adSetPart = (async () => {
        const out: string[] = [];
        const perCampaign = await Promise.all(
          adSetCampaigns.map(async (campaign) => {
            try {
              const adSets = [...(await getAdSetRows(campaign.id, dateRange, dateKey, limit))].sort(bySpend).slice(0, ADSETS_PER_CAMPAIGN);
              const withAds = await Promise.all(
                adSets.map(async (adSet) => {
                  try {
                    const ads = await getAdRows(adSet.id, dateRange, dateKey, limit);
                    return { adSet, total: ads.length, active: ads.filter((a) => a.status === "ACTIVE").length };
                  } catch {
                    return { adSet, total: 0, active: 0 };
                  }
                })
              );
              return { campaign, adSetCount: adSets.length, withAds };
            } catch (err) {
              console.warn(`[analyst] ad sets for campaign ${campaign.id} failed:`, errText(err));
              return null;
            }
          })
        );
        for (const r of perCampaign) {
          if (!r || r.withAds.length === 0) continue;
          out.push(`\n  **${r.campaign.name}** (top ${r.withAds.length} ad sets):`);
          r.withAds.forEach(({ adSet, total, active }) => out.push(formatAdSetContext(adSet, currency, total, active)));
        }
        return out;
      })();

      const breakdownPart = (async () => {
        const [demographics, placements, learning, customConvs] = await Promise.allSettled([
          limit(() => fetchDemographicBreakdown(id, dateRange)),
          limit(() => fetchPlacementBreakdown(id, dateRange)),
          limit(() => fetchAdSetLearningStages(id)),
          limit(() => fetchCustomConversions(id)),
        ]);
        const conversions = await limit(() =>
          fetchConversionBreakdown(id, dateRange, customConvs.status === "fulfilled" ? customConvs.value : [])
        ).catch((err) => {
          console.warn(`[analyst] conversions for ${id} failed:`, errText(err));
          return [];
        });
        const out: string[] = [];
        const conversionText = formatConversionBreakdown(conversions, account.name, currency);
        const demoTable = formatDemographicTable(demographics.status === "fulfilled" ? demographics.value : [], account.name, currency);
        const placementTable = formatPlacementTable(placements.status === "fulfilled" ? placements.value : [], account.name, currency);
        const learningText = formatLearningStages(learning.status === "fulfilled" ? learning.value : [], account.name);
        for (const t of [conversionText, demoTable, placementTable, learningText]) if (t) out.push(t);
        return out;
      })();

      const [adSetLines, breakdownLines] = await Promise.all([adSetPart, breakdownPart]);
      return { adSetLines, breakdownLines };
    })
  );

  const adSetParts = deep.filter((d) => d.adSetLines.length > 0).map((d) => d.adSetLines.join("\n"));
  const adSetsFit = fitParts(adSetParts, SECTION_BUDGETS.adSets);
  if (adSetParts.length > 0) sections.push("\n## Ad Sets & Ads\n", adSetsFit.text);
  const breakdownParts = deep.filter((d) => d.breakdownLines.length > 0).map((d) => d.breakdownLines.join("\n"));
  const breakdownsFit = fitParts(breakdownParts, SECTION_BUDGETS.breakdowns);
  if (breakdownParts.length > 0) sections.push(breakdownsFit.text);

  if (
    contextAccounts.length > 0 &&
    contextAccounts.every((a) => a.insights.spend === 0 && a.insights.impressions === 0)
  ) {
    sections.push("\n*Note: no spend or impressions in the selected period.*");
  }

  // What actually made it into the text (budgets can cut the low-spend tail).
  const listedAccounts = active.included + inactive.included;
  const detail =
    ` Accounts listed: ${listedAccounts} of ${contextAccounts.length}, highest spend first` +
    `${listedAccounts < contextAccounts.length ? " (the rest were cut for length)" : ""}.` +
    ` Campaign detail for ${plural(campaignAccountsShown, "account")};` +
    ` ad sets for ${plural(adSetsFit.included, "account")};` +
    ` breakdowns for ${plural(breakdownsFit.included, "account")} — the highest-spending ones.`;
  const scope =
    (selectedAccounts.size > 0
      ? `${plural(contextAccounts.length, "account")} selected by the user${
          selectedCampaigns.size > 0 ? `, with ${plural(selectedCampaigns.size, "campaign")} picked` : ""
        }.`
      : `all ${activeAccounts.length} active accounts.`) + detail;

  return { contextText: sections.join("\n"), scope, knownAccountIds };
}
