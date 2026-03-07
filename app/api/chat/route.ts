export const dynamic = "force-dynamic";

import Anthropic from "@anthropic-ai/sdk";
import { getAdminSession } from "@/lib/adminSession";
import { fetchOwnedAccounts, fetchAllAccountInsightsBatch, fetchCampaigns } from "@/lib/meta/endpoints";
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
import { transformInsight, transformAccount, transformCampaign } from "@/lib/meta/transformers";
import cache, { CacheKeys, TTL } from "@/lib/cache";
import { dateRangeCacheKey, formatCurrency, formatRoas, formatPercent, formatNumber, getPreviousPeriod } from "@/lib/utils";
import { RateLimitError, TokenExpiredError } from "@/lib/meta/client";
import type { DateRangeInput } from "@/types/api";
import type { AccountSummary, CampaignRow } from "@/types/dashboard";
import { ALLOWED_MODELS, type ChatModelId } from "@/lib/chatModels";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── Input constraints ──────────────────────────────────────────────────────
const MAX_MESSAGES        = 50;
const MAX_MESSAGE_CHARS   = 8_000;
const ALLOWED_PRESETS     = new Set(["last_7d", "last_14d", "last_30d", "last_90d", "this_month", "last_month"]);
const DATE_RE             = /^\d{4}-\d{2}-\d{2}$/;

// ─── Per-session rate limiter (in-memory) ───────────────────────────────────
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX       = 20;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(adminId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(adminId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(adminId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function buildDateLabel(dateRange: DateRangeInput): string {
  if (dateRange.preset) {
    const labels: Record<string, string> = {
      last_7d: "Last 7 days",
      last_14d: "Last 14 days",
      last_30d: "Last 30 days",
      last_90d: "Last 90 days",
      this_month: "This month",
      last_month: "Last month",
    };
    return labels[dateRange.preset] ?? dateRange.preset;
  }
  if (dateRange.since && dateRange.until) {
    return `${dateRange.since} to ${dateRange.until}`;
  }
  return "Last 30 days";
}

function formatAccountContext(account: AccountSummary): string {
  const m = account.insights;
  const cur = account.currency;
  return [
    `**${account.name}** (${account.id}) — Status: ${account.status} | Currency: ${cur}`,
    `  Spend: ${formatCurrency(m.spend, cur)} | ROAS: ${formatRoas(m.roas)} | Revenue: ${formatCurrency(m.conversionValue, cur)}`,
    `  Impressions: ${formatNumber(m.impressions)} | Clicks: ${formatNumber(m.clicks)} | CTR: ${formatPercent(m.ctr)}`,
    `  CPC: ${formatCurrency(m.cpc, cur)} | CPM: ${formatCurrency(m.cpm, cur)}`,
    `  Conversions: ${Math.round(m.conversions)} | Cost/Purchase: ${m.costPerPurchase > 0 ? formatCurrency(m.costPerPurchase, cur) : "N/A"}`,
  ].join("\n");
}

function formatCampaignContext(campaign: CampaignRow, currency: string): string {
  const m = campaign.insights;
  const budget = campaign.budget > 0
    ? `${formatCurrency(campaign.budget, currency)}/${campaign.budgetType === "daily" ? "day" : "lifetime"}`
    : "No budget";
  return [
    `  - **${campaign.name}** — ${campaign.status} | ${campaign.objective}`,
    `    Budget: ${budget} | Spend: ${formatCurrency(m.spend, currency)} | Revenue: ${formatCurrency(m.conversionValue, currency)} | ROAS: ${formatRoas(m.roas)}`,
    `    CTR: ${formatPercent(m.ctr)} | CPC: ${formatCurrency(m.cpc, currency)} | Conversions: ${Math.round(m.conversions)} | Cost/Purchase: ${m.costPerPurchase > 0 ? formatCurrency(m.costPerPurchase, currency) : "N/A"}`,
  ].join("\n");
}

const MAX_CONTEXT_CHARS = 8000;

/**
 * Get account summaries — tries the shared dashboard cache first (same data the UI shows),
 * falls back to fresh fetch + populate the cache.
 */
async function getAccountSummaries(dateRange: DateRangeInput): Promise<AccountSummary[]> {
  const dateKey = dateRangeCacheKey(dateRange);
  const cacheKey = CacheKeys.allInsights(dateKey);

  const cached = cache.get<AccountSummary[]>(cacheKey);
  if (cached) return cached;

  const accounts = await fetchOwnedAccounts();
  const accountIds = accounts.map((a) => a.id);

  const prevDateRange = getPreviousPeriod(dateRange);
  const [currentInsightsMap, previousInsightsMap] = await Promise.all([
    fetchAllAccountInsightsBatch(accountIds, dateRange),
    fetchAllAccountInsightsBatch(accountIds, prevDateRange),
  ]);

  const missing = accounts.filter((a) => !currentInsightsMap.has(a.id));
  if (missing.length > 0) {
    console.warn(
      `[chat] ${missing.length} account(s) returned no insights (showing $0):`,
      missing.map((a) => `${a.name} (${a.id})`).join(", ")
    );
  }

  const summaries: AccountSummary[] = accounts.map((account) => {
    const rawCurrent = currentInsightsMap.get(account.id);
    const rawPrevious = previousInsightsMap.get(account.id);
    const currentMetrics = rawCurrent ? transformInsight(rawCurrent) : emptyInsights();
    const previousMetrics = rawPrevious ? transformInsight(rawPrevious) : undefined;
    return transformAccount(account, currentMetrics, previousMetrics);
  });

  cache.set(cacheKey, summaries, TTL.ACCOUNTS);
  return summaries;
}

function emptyInsights() {
  return {
    spend: 0, impressions: 0, reach: 0, clicks: 0,
    ctr: 0, cpc: 0, cpm: 0, roas: 0,
    conversions: 0, conversionValue: 0, costPerPurchase: 0,
  };
}

function badRequest(msg: string) {
  return new Response(JSON.stringify({ error: msg }), { status: 400 });
}

export async function POST(request: Request) {
  const session = getAdminSession();
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  // Rate limit per admin session
  if (!checkRateLimit(session.adminId)) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please wait before sending another message." }),
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return badRequest("Invalid request body");

    const {
      messages:             rawMessages,
      selectedAccountIds:   rawAccountIds,
      selectedCampaignIds:  rawCampaignIds,
      dateRange:            dateRangeRaw,
      model:                modelRaw,
    } = body as Record<string, unknown>;

    // ── Validate messages ────────────────────────────────────────────────────
    if (!Array.isArray(rawMessages) || rawMessages.length === 0) return badRequest("messages is required");
    if (rawMessages.length > MAX_MESSAGES) return badRequest(`messages exceeds limit of ${MAX_MESSAGES}`);
    for (const msg of rawMessages) {
      if (!msg || typeof msg !== "object") return badRequest("Invalid message format");
      const { role, content } = msg as Record<string, unknown>;
      if (!["user", "assistant"].includes(role as string)) return badRequest("Invalid message role");
      if (typeof content !== "string") return badRequest("Invalid message content");
      if (content.length > MAX_MESSAGE_CHARS) return badRequest(`Message content exceeds ${MAX_MESSAGE_CHARS} characters`);
    }
    const validMessages = rawMessages as ChatMessage[];

    // ── Validate model ───────────────────────────────────────────────────────
    const model: ChatModelId =
      typeof modelRaw === "string" && ALLOWED_MODELS.includes(modelRaw as ChatModelId)
        ? (modelRaw as ChatModelId)
        : "claude-sonnet-4-6";

    // ── Validate dateRange ───────────────────────────────────────────────────
    const dateRangeInput = (dateRangeRaw && typeof dateRangeRaw === "object") ? dateRangeRaw as Record<string, unknown> : {};
    if (dateRangeInput.preset !== undefined && (typeof dateRangeInput.preset !== "string" || !ALLOWED_PRESETS.has(dateRangeInput.preset))) {
      return badRequest("Invalid date preset");
    }
    if (dateRangeInput.since !== undefined && (typeof dateRangeInput.since !== "string" || !DATE_RE.test(dateRangeInput.since))) {
      return badRequest("Invalid since date format (expected YYYY-MM-DD)");
    }
    if (dateRangeInput.until !== undefined && (typeof dateRangeInput.until !== "string" || !DATE_RE.test(dateRangeInput.until))) {
      return badRequest("Invalid until date format (expected YYYY-MM-DD)");
    }
    const dateRange: DateRangeInput = Object.keys(dateRangeInput).length > 0
      ? dateRangeInput as DateRangeInput
      : { preset: "last_30d" };

    // ── Validate selectedAccountIds / selectedCampaignIds ────────────────────
    const selectedAccountIds: string[] = Array.isArray(rawAccountIds)
      ? (rawAccountIds as unknown[]).filter((id): id is string => typeof id === "string" && id.length <= 64).slice(0, 50)
      : [];
    const selectedCampaignIds: string[] = Array.isArray(rawCampaignIds)
      ? (rawCampaignIds as unknown[]).filter((id): id is string => typeof id === "string" && id.length <= 64).slice(0, 200)
      : [];
    const dateLabel = buildDateLabel(dateRange);
    const dateKey = dateRangeCacheKey(dateRange);

    // Use shared cache — same data the dashboard displays
    const accountSummaries = await getAccountSummaries(dateRange);

    // Filter to selected accounts (or all if none selected)
    const contextAccounts = selectedAccountIds.length > 0
      ? accountSummaries.filter((a) => selectedAccountIds.includes(a.id))
      : accountSummaries;

    // Build context string — accounts section
    const contextParts: string[] = [];
    contextParts.push(`## Ad Accounts (${contextAccounts.length} of ${accountSummaries.length} total)\n`);
    for (const account of contextAccounts) {
      contextParts.push(formatAccountContext(account));
    }

    // Fetch campaigns for selected accounts (capped at 5 accounts, 10 campaigns each)
    const accountsNeedingCampaigns = selectedAccountIds.length > 0 ? selectedAccountIds : [];
    if (accountsNeedingCampaigns.length > 0 || selectedCampaignIds.length > 0) {
      contextParts.push("\n## Campaigns\n");

      for (const accountId of accountsNeedingCampaigns.slice(0, 5)) {
        const cacheKey = CacheKeys.campaigns(accountId) + `:${dateKey}`;
        let campaigns = cache.get<CampaignRow[]>(cacheKey);

        if (!campaigns) {
          const rawCampaigns = await fetchCampaigns(accountId, dateRange);
          campaigns = rawCampaigns.map(transformCampaign);
          cache.set(cacheKey, campaigns, TTL.CAMPAIGNS);
        }

        const account = accountSummaries.find((a) => a.id === accountId);
        const accountName = account?.name ?? accountId;
        const currency = account?.currency ?? "USD";

        // Sort by spend desc, cap at 10
        const topCampaigns = [...campaigns]
          .sort((a, b) => b.insights.spend - a.insights.spend)
          .slice(0, 10);

        if (topCampaigns.length > 0) {
          contextParts.push(`\n**${accountName}** campaigns (top ${topCampaigns.length} by spend):`);
          for (const c of topCampaigns) {
            contextParts.push(formatCampaignContext(c, currency));
          }
        }
      }
    }

    // Fetch enriched breakdown data for selected accounts (capped at 3 to limit Meta API calls)
    if (accountsNeedingCampaigns.length > 0) {
      for (const accountId of accountsNeedingCampaigns.slice(0, 3)) {
        const account = accountSummaries.find((a) => a.id === accountId);
        const accountName = account?.name ?? accountId;
        const currency = account?.currency ?? "USD";

        const [demographics, placements, learningStages, customConversions] = await Promise.allSettled([
          fetchDemographicBreakdown(accountId, dateRange),
          fetchPlacementBreakdown(accountId, dateRange),
          fetchAdSetLearningStages(accountId),
          fetchCustomConversions(accountId),
        ]);

        const demoRows      = demographics.status      === "fulfilled" ? demographics.value      : [];
        const placementRows = placements.status        === "fulfilled" ? placements.value        : [];
        const learningRows  = learningStages.status    === "fulfilled" ? learningStages.value    : [];
        const customConvs   = customConversions.status === "fulfilled" ? customConversions.value : [];

        // Conversion breakdown needs custom conversion names to decode IDs
        const conversionEvents = await fetchConversionBreakdown(accountId, dateRange, customConvs).catch(() => []);

        const demoTable        = formatDemographicTable(demoRows, accountName, currency);
        const placementTable   = formatPlacementTable(placementRows, accountName, currency);
        const learningText     = formatLearningStages(learningRows, accountName);
        const conversionText   = formatConversionBreakdown(conversionEvents, accountName, currency);

        if (conversionText)  contextParts.push(conversionText);
        if (demoTable)       contextParts.push(demoTable);
        if (placementTable)  contextParts.push(placementTable);
        if (learningText)    contextParts.push(learningText);
      }
    }

    let contextString = contextParts.join("\n");

    // Truncate if too large
    if (contextString.length > MAX_CONTEXT_CHARS) {
      contextString = contextString.slice(0, MAX_CONTEXT_CHARS) +
        "\n\n[Context truncated — select specific accounts for more detail]";
    }

    // Warn Claude if no meaningful data exists
    const totalSpend = contextAccounts.reduce((s, a) => s + a.insights.spend, 0);
    if (totalSpend === 0 && contextAccounts.every((a) => a.insights.impressions === 0)) {
      contextString += "\n\n*Note: No spend or impression data found for the selected period.*";
    }

    const systemPrompt = `You are an expert Meta Ads analyst working inside the Agency Collective advertising dashboard.

You have been given real-time data from Meta's API for the period: ${dateLabel}.

CURRENT META ADS DATA:
${contextString}

YOUR ROLE:
- Analyze data with precision; identify patterns, anomalies, opportunities
- Provide specific, actionable recommendations grounded in the numbers
- Format with markdown: tables for comparisons, bold for key metrics
- Cite specific numbers (e.g., "CTR of 1.2% is below the 2% Meta benchmark")
- End complex analyses with a numbered "Key Actions" section
- Always use the account's own currency when referencing spend/revenue

If the user asks about data not in context, say so and suggest what to select.`;

    // Stream response from Claude
    const stream = await anthropic.messages.stream({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: validMessages.map((m) => ({ role: m.role, content: m.content })),
    });

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (
              chunk.type === "content_block_delta" &&
              chunk.delta.type === "text_delta"
            ) {
              controller.enqueue(new TextEncoder().encode(chunk.delta.text));
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Accel-Buffering": "no",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return new Response(
        JSON.stringify({ error: "Meta API rate limit reached. Please try again shortly.", retryAfter: err.retryAfterSeconds }),
        { status: 429, headers: { "Retry-After": String(err.retryAfterSeconds) } }
      );
    }
    if (err instanceof TokenExpiredError) {
      return new Response(JSON.stringify({ error: "Meta access token is invalid or expired." }), { status: 401 });
    }
    console.error("[chat] API error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500 }
    );
  }
}
