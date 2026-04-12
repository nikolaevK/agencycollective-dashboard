export const dynamic = "force-dynamic";

import Anthropic from "@anthropic-ai/sdk";
import { getAdminSession } from "@/lib/adminSession";
import { fetchOwnedAccounts, fetchAllAccountInsightsBatch, fetchCampaigns, fetchAdSets, fetchAds } from "@/lib/meta/endpoints";
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
import { transformInsight, transformAccount, transformCampaign, transformAdSet, transformAd } from "@/lib/meta/transformers";
import cache, { CacheKeys, TTL } from "@/lib/cache";
import { dateRangeCacheKey, formatCurrency, formatRoas, formatPercent, formatNumber, getPreviousPeriod } from "@/lib/utils";
import { RateLimitError, TokenExpiredError } from "@/lib/meta/client";
import { CHAT_TOOLS, DISPLAY_TOOLS } from "@/lib/chatTools";
import { generateReport } from "@/lib/reportGenerator";
import { ANALYST_SKILLS } from "@/lib/chatSkills";
import { fetchAndExtractPage } from "@/lib/urlValidation";
import type { DateRangeInput } from "@/types/api";
import type { AccountSummary, CampaignRow } from "@/types/dashboard";
import { ALLOWED_MODELS, type ChatModelId } from "@/lib/chatModels";
import type { GenerateReportInput, ApiContentBlock } from "@/types/chat";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── Input constraints ──────────────────────────────────────────────────────
const MAX_MESSAGES        = 50;
const MAX_MESSAGE_CHARS   = 8_000;
const MAX_TOOL_ITERATIONS = 15;
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
    // Periodic cleanup: purge expired entries when map grows large
    if (rateLimitMap.size > 500) {
      for (const [key, val] of rateLimitMap) {
        if (now > val.resetAt) rateLimitMap.delete(key);
      }
    }
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
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
  return "Last 7 days";
}

function formatAccountContext(account: AccountSummary): string {
  const m = account.insights;
  const cur = account.currency;
  return [
    `**${account.name}** (${account.id}) — Status: ${account.status} | Currency: ${cur}`,
    `  Spend: ${formatCurrency(m.spend, cur)} | ROAS: ${formatRoas(m.roas)} | Revenue: ${formatCurrency(m.conversionValue, cur)}`,
    `  Impressions: ${formatNumber(m.impressions)} | Clicks: ${formatNumber(m.clicks)} | CTR: ${formatPercent(m.ctr)}`,
    `  CPC: ${formatCurrency(m.cpc, cur)} | CPM: ${formatCurrency(m.cpm, cur)} | Frequency: ${m.frequency.toFixed(1)}`,
    `  Conversions: ${Math.round(m.conversions)} | Cost/Purchase: ${m.costPerPurchase > 0 ? formatCurrency(m.costPerPurchase, cur) : "N/A"}${m.leads > 0 ? ` | Leads: ${Math.round(m.leads)}` : ""}${m.leadValue > 0 ? ` | Lead Value: ${formatCurrency(m.leadValue, cur)}` : ""}${m.instagramProfileVisits > 0 ? ` | IG Profile Visits: ${formatNumber(m.instagramProfileVisits)}` : ""}`,
  ].join("\n");
}

function formatCampaignContext(campaign: CampaignRow, currency: string): string {
  const m = campaign.insights;
  const budget = campaign.budget > 0
    ? `${formatCurrency(campaign.budget, currency)}/${campaign.budgetType === "daily" ? "day" : "lifetime"}`
    : "No budget";
  return [
    `  - **${campaign.name}** — ${campaign.status} | ${campaign.objective}${campaign.advantagePlus ? " | Advantage+" : ""}`,
    `    Budget: ${budget} | Spend: ${formatCurrency(m.spend, currency)} | Revenue: ${formatCurrency(m.conversionValue, currency)} | ROAS: ${formatRoas(m.roas)}`,
    `    CTR: ${formatPercent(m.ctr)} | CPC: ${formatCurrency(m.cpc, currency)} | Conversions: ${Math.round(m.conversions)} | Cost/Purchase: ${m.costPerPurchase > 0 ? formatCurrency(m.costPerPurchase, currency) : "N/A"}${m.leads > 0 ? ` | Leads: ${Math.round(m.leads)}${m.leadValue > 0 ? ` (${formatCurrency(m.leadValue, currency)})` : ""}` : ""}`,
  ].join("\n");
}

function formatAdSetContext(adSet: import("@/types/dashboard").AdSetRow, currency: string, adCount: number, activeAdCount: number): string {
  const m = adSet.insights;
  const budget = adSet.budget > 0
    ? `${formatCurrency(adSet.budget, currency)}/${adSet.budgetType === "daily" ? "day" : "lifetime"}`
    : "No budget";
  const leadStr = m.leads > 0 ? ` | Leads: ${Math.round(m.leads)}` : "";
  return `    - **${adSet.name}** — ${adSet.status} | ${adSet.optimizationGoal}${adSet.budgetSharing ? " | CBO" : ""} | Budget: ${budget} | Spend: ${formatCurrency(m.spend, currency)} | ROAS: ${formatRoas(m.roas)} | Freq: ${m.frequency.toFixed(1)}${leadStr} | ${activeAdCount} active ads (${adCount} total)`;
}

const MAX_CONTEXT_CHARS = 8000;

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
    frequency: 0, instagramProfileVisits: 0, leads: 0, leadValue: 0,
  };
}

function badRequest(msg: string) {
  return new Response(JSON.stringify({ error: msg }), { status: 400 });
}

// ─── SSE helpers ─────────────────────────────────────────────────────────────

function sseEvent(event: string, data: unknown): string {
  // JSON.stringify output is always single-line (no literal newlines), safe for SSE data field
  const json = JSON.stringify(data);
  return `event: ${event}\ndata: ${json}\n\n`;
}

// ─── Validate API content blocks ─────────────────────────────────────────────

function isValidContentBlock(block: unknown): block is ApiContentBlock {
  if (!block || typeof block !== "object") return false;
  const b = block as Record<string, unknown>;
  if (b.type === "text" && typeof b.text === "string") return true;
  if (b.type === "tool_use" && typeof b.id === "string" && typeof b.name === "string") return true;
  if (b.type === "tool_result" && typeof b.tool_use_id === "string") return true;
  return false;
}

function validateMessageContent(
  content: unknown
): Anthropic.Messages.MessageParam["content"] | null {
  if (typeof content === "string") {
    if (content.length > MAX_MESSAGE_CHARS) return null;
    return content;
  }
  if (Array.isArray(content)) {
    const blocks: Anthropic.Messages.ContentBlockParam[] = [];
    for (const block of content) {
      if (!isValidContentBlock(block)) return null;
      if (block.type === "text") {
        if (block.text.length > MAX_MESSAGE_CHARS) return null;
        blocks.push({ type: "text", text: block.text });
      } else if (block.type === "tool_use") {
        blocks.push({
          type: "tool_use",
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      } else if (block.type === "tool_result") {
        blocks.push({
          type: "tool_result",
          tool_use_id: block.tool_use_id,
          content: typeof block.content === "string" ? block.content : JSON.stringify(block.content),
        });
      }
    }
    return blocks.length > 0 ? blocks : null;
  }
  return null;
}

// ─── Main handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const session = getAdminSession();
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  if (!checkRateLimit(session.adminId)) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please wait before sending another message." }),
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  try {
    const contentLength = parseInt(request.headers.get("content-length") ?? "0", 10);
    if (contentLength > 512_000) return badRequest("Request body too large");

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

    const validMessages: Anthropic.Messages.MessageParam[] = [];
    for (const msg of rawMessages) {
      if (!msg || typeof msg !== "object") return badRequest("Invalid message format");
      const { role, content } = msg as Record<string, unknown>;
      if (!["user", "assistant"].includes(role as string)) return badRequest("Invalid message role");
      const validated = validateMessageContent(content);
      if (validated === null) return badRequest("Invalid message content");
      validMessages.push({ role: role as "user" | "assistant", content: validated });
    }

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
      : { preset: "last_7d" };

    // ── Validate selectedAccountIds / selectedCampaignIds ────────────────────
    const selectedAccountIds: string[] = Array.isArray(rawAccountIds)
      ? (rawAccountIds as unknown[]).filter((id): id is string => typeof id === "string" && id.length <= 64).slice(0, 50)
      : [];
    const selectedCampaignIds: string[] = Array.isArray(rawCampaignIds)
      ? (rawCampaignIds as unknown[]).filter((id): id is string => typeof id === "string" && id.length <= 64).slice(0, 200)
      : [];
    const dateLabel = buildDateLabel(dateRange);
    const dateKey = dateRangeCacheKey(dateRange);

    // Use shared cache
    const accountSummaries = await getAccountSummaries(dateRange);

    const contextAccounts = selectedAccountIds.length > 0
      ? accountSummaries.filter((a) => selectedAccountIds.includes(a.id))
      : accountSummaries.filter((a) => a.status === "ACTIVE");

    // Build context string — separate active from inactive so Claude doesn't confuse them
    const contextParts: string[] = [];
    const activeAccounts = contextAccounts.filter((a) => a.status === "ACTIVE");
    const inactiveAccounts = contextAccounts.filter((a) => a.status !== "ACTIVE");

    contextParts.push(`## ACTIVE Ad Accounts (${activeAccounts.length} currently running)\n`);
    if (activeAccounts.length > 0) {
      for (const account of activeAccounts) {
        contextParts.push(formatAccountContext(account));
      }
    } else {
      contextParts.push("No active accounts in this selection.");
    }

    if (inactiveAccounts.length > 0) {
      contextParts.push(`\n## INACTIVE / PAUSED Ad Accounts (${inactiveAccounts.length} — NOT currently running)\n`);
      contextParts.push("⚠ These accounts are NOT active. Their data is historical only. Do NOT include them in performance rankings or active analysis unless the user explicitly asks.\n");
      for (const account of inactiveAccounts) {
        contextParts.push(formatAccountContext(account));
      }
    }

    // When specific accounts are selected, enrich those. Otherwise auto-enrich top active accounts by spend.
    const accountsNeedingCampaigns = selectedAccountIds.length > 0
      ? selectedAccountIds
      : contextAccounts
          .filter((a) => a.status === "ACTIVE")
          .sort((a, b) => b.insights.spend - a.insights.spend)
          .slice(0, 5)
          .map((a) => a.id);
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

        let topCampaigns = [...campaigns]
          .sort((a, b) => b.insights.spend - a.insights.spend)
          .filter((c) => c.status === "ACTIVE");
        if (selectedCampaignIds.length > 0) {
          topCampaigns = topCampaigns.filter((c) => selectedCampaignIds.includes(c.id));
        }
        topCampaigns = topCampaigns.slice(0, 10);

        if (topCampaigns.length > 0) {
          contextParts.push(`\n**${accountName}** campaigns (top ${topCampaigns.length} by spend):`);
          for (const c of topCampaigns) {
            contextParts.push(formatCampaignContext(c, currency));
          }
        }
      }
    }

    // Fetch ad set & ad data for top campaigns (parallelized)
    if (accountsNeedingCampaigns.length > 0) {
      const adSetParts: string[] = [];
      for (const accountId of accountsNeedingCampaigns.slice(0, 3)) {
        const account = accountSummaries.find((a) => a.id === accountId);
        if (account?.status !== "ACTIVE") continue;
        const currency = account.currency ?? "USD";

        const campCacheKey = CacheKeys.campaigns(accountId) + `:${dateKey}`;
        const campaigns = cache.get<CampaignRow[]>(campCacheKey) ?? [];
        const activeCampaigns = campaigns.filter((c) => c.status === "ACTIVE").slice(0, 3);

        // Fetch all ad sets for all campaigns in parallel
        const adSetResults = await Promise.all(
          activeCampaigns.map(async (campaign) => {
            try {
              const adSetCacheKey = `adsets:${campaign.id}:${dateKey}`;
              let adSets = cache.get<import("@/types/dashboard").AdSetRow[]>(adSetCacheKey);
              if (!adSets) {
                const rawAdSets = await fetchAdSets(campaign.id, dateRange);
                adSets = rawAdSets.map(transformAdSet);
                cache.set(adSetCacheKey, adSets, TTL.CAMPAIGNS);
              }
              return { campaign, adSets };
            } catch (err) {
              console.warn(`[chat] Failed to fetch ad sets for campaign ${campaign.id}:`, err instanceof Error ? err.message : err);
              return null;
            }
          })
        );

        for (const result of adSetResults) {
          if (!result) continue;
          const { campaign, adSets } = result;
          const topAdSets = [...adSets].sort((a, b) => b.insights.spend - a.insights.spend).slice(0, 3);
          if (topAdSets.length === 0) continue;

          adSetParts.push(`\n  **${campaign.name}** (${adSets.length} ad sets):`);

          // Fetch ads for all top ad sets in parallel
          const adsResults = await Promise.all(
            topAdSets.map(async (adSet) => {
              try {
                const adsCacheKey = `ads:${adSet.id}:${dateKey}`;
                let ads = cache.get<import("@/types/dashboard").AdRow[]>(adsCacheKey);
                if (!ads) {
                  const rawAds = await fetchAds(adSet.id, dateRange);
                  ads = rawAds.map(transformAd);
                  cache.set(adsCacheKey, ads, TTL.CAMPAIGNS);
                }
                return { adSet, totalAds: ads.length, activeAds: ads.filter((a) => a.status === "ACTIVE").length };
              } catch {
                return { adSet, totalAds: 0, activeAds: 0 };
              }
            })
          );

          for (const { adSet, totalAds, activeAds } of adsResults) {
            adSetParts.push(formatAdSetContext(adSet, currency, totalAds, activeAds));
          }
        }
      }
      if (adSetParts.length > 0) {
        contextParts.push("\n## Ad Sets & Ads\n");
        contextParts.push(...adSetParts);
      }
    }

    // Fetch enriched breakdown data (active accounts only)
    const activeAccountsForEnrich = accountsNeedingCampaigns.filter((id) => {
      const acct = accountSummaries.find((a) => a.id === id);
      return acct?.status === "ACTIVE";
    });
    if (activeAccountsForEnrich.length > 0) {
      for (const accountId of activeAccountsForEnrich.slice(0, 3)) {
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

        const conversionEvents = await fetchConversionBreakdown(accountId, dateRange, customConvs).catch((err) => {
          console.warn(`[chat] Failed to fetch conversions for ${accountId}:`, err instanceof Error ? err.message : err);
          return [];
        });

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

    if (contextString.length > MAX_CONTEXT_CHARS) {
      contextString = contextString.slice(0, MAX_CONTEXT_CHARS) +
        "\n\n[Context truncated — select specific accounts for more detail]";
    }

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
- ALWAYS respect and accurately report each account's Status field (ACTIVE, PAUSED, DISABLED, etc.). Never present an inactive/paused account as active. When summarizing accounts, clearly indicate their status. Only include active accounts in performance rankings unless the user explicitly asks about paused/disabled accounts.
- By default, only ACTIVE accounts and ACTIVE campaigns are included in your data context. If the user asks about paused or inactive accounts/campaigns, let them know they can select those accounts specifically from the sidebar to include them in the analysis.

AVAILABLE TOOLS:
- display_metrics: Show KPI cards for 2–6 key metrics. Prefer this over plain text for presenting important numbers like ROAS, spend, conversions, CPA. Always use this when presenting a performance summary.
- display_chart: Visualize data with charts. Use "line" for trends over time, "bar" for comparisons between items, "pie" or "donut" for proportional breakdowns. Include meaningful data points.
- display_table: Show detailed tabular data. Use for campaign breakdowns, demographic details, or any data with 4+ rows where precision matters.
- generate_report: Produce a comprehensive, branded performance report for a client. ONLY use when the user explicitly asks for a "report", "client summary", or "performance document". Use the actual Meta account ID from the context data.
- fetch_landing_page: Fetch and extract text content from a landing page URL for conversion audit. Use when the user provides a URL and wants landing page analysis, or when high CTR + low conversion rate suggests a post-click problem. Always fetch before analyzing — never guess page content.

TOOL USAGE GUIDELINES:
- Always include explanatory text before and/or after tool calls — never call a tool silently.
- For performance summaries, use display_metrics for the top KPIs, then explain the numbers.
- For comparisons, combine display_chart with display_table for visual + detailed views.
- You can use multiple tools in one response when it adds value.
- For display_chart data: ensure all numeric values are actual numbers (not strings), and xAxisKey items should be short labels.
- NEVER use markdown tables (pipe-delimited tables). ALWAYS use the display_table tool instead. Markdown tables often render as broken raw text. The display_table tool renders perfectly every time with proper formatting, alignment, and styling.

If the user asks about data not in context, say so and suggest what to select.

${ANALYST_SKILLS}`;

    // ── SSE streaming with tool use loop ─────────────────────────────────────

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          let messages = [...validMessages];
          let iterations = 0;

          while (iterations < MAX_TOOL_ITERATIONS) {
            iterations++;

            const response = await anthropic.messages.create({
              model,
              max_tokens: 4096,
              system: systemPrompt,
              messages,
              tools: CHAT_TOOLS,
              stream: true,
            }, { timeout: 60000 });

            let currentToolId = "";
            let currentToolName = "";
            let currentToolInput = "";
            let accumulatedText = "";
            const toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
            let stopReason: string | null = null;

            for await (const event of response) {
              if (event.type === "content_block_start") {
                if (event.content_block.type === "tool_use") {
                  currentToolId = event.content_block.id;
                  currentToolName = event.content_block.name;
                  currentToolInput = "";
                }
              } else if (event.type === "content_block_delta") {
                if (event.delta.type === "text_delta") {
                  accumulatedText += event.delta.text;
                  controller.enqueue(encoder.encode(sseEvent("text_delta", { text: event.delta.text })));
                } else if (event.delta.type === "input_json_delta") {
                  currentToolInput += event.delta.partial_json;
                }
              } else if (event.type === "content_block_stop") {
                if (currentToolId && currentToolName) {
                  let parsedInput: Record<string, unknown>;
                  try {
                    parsedInput = JSON.parse(currentToolInput || "{}");
                  } catch {
                    // Malformed JSON from Claude — report error back as tool result
                    parsedInput = {};
                    toolUseBlocks.push({ id: currentToolId, name: currentToolName, input: parsedInput });
                    controller.enqueue(encoder.encode(sseEvent("tool_use", {
                      id: currentToolId, name: currentToolName, input: parsedInput,
                    })));
                    currentToolId = "";
                    currentToolName = "";
                    currentToolInput = "";
                    continue;
                  }

                  toolUseBlocks.push({ id: currentToolId, name: currentToolName, input: parsedInput });
                  controller.enqueue(encoder.encode(sseEvent("tool_use", {
                    id: currentToolId, name: currentToolName, input: parsedInput,
                  })));

                  currentToolId = "";
                  currentToolName = "";
                  currentToolInput = "";
                }
              } else if (event.type === "message_delta") {
                stopReason = event.delta.stop_reason;
              }
            }

            // If no tool calls, we're done
            if (stopReason !== "tool_use" || toolUseBlocks.length === 0) {
              break;
            }

            // Build assistant message with BOTH text and tool_use blocks for conversation history
            const assistantBlocks: Anthropic.Messages.ContentBlockParam[] = [];
            if (accumulatedText) {
              assistantBlocks.push({ type: "text", text: accumulatedText });
            }
            for (const tool of toolUseBlocks) {
              assistantBlocks.push({
                type: "tool_use",
                id: tool.id,
                name: tool.name,
                input: tool.input,
              });
            }

            // Process tool results
            const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
            for (const tool of toolUseBlocks) {
              if (DISPLAY_TOOLS.has(tool.name)) {
                // Display tools: auto-synthesize success result
                const displayResult = "Displayed successfully to the user.";
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: tool.id,
                  content: displayResult,
                });
                // Stream to client so it can include in conversation history
                controller.enqueue(encoder.encode(sseEvent("tool_result", {
                  tool_use_id: tool.id,
                  result: displayResult,
                })));
              } else if (tool.name === "generate_report") {
                // Server-side execution
                try {
                  const reportInput = tool.input as unknown as GenerateReportInput;
                  const report = await generateReport(reportInput);

                  // Stream the report result to the client
                  controller.enqueue(encoder.encode(sseEvent("tool_result", {
                    tool_use_id: tool.id,
                    result: report,
                  })));

                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: tool.id,
                    content: JSON.stringify(report),
                  });
                } catch (err) {
                  const errorMsg = err instanceof Error ? err.message : "Report generation failed";
                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: tool.id,
                    content: `Error: ${errorMsg}`,
                    is_error: true,
                  });
                }
              } else if (tool.name === "fetch_landing_page") {
                try {
                  const { url } = tool.input as { url: string };
                  const textContent = await fetchAndExtractPage(url);
                  const result = `Landing page content from ${url}:\n\n${textContent}`;

                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: tool.id,
                    content: result,
                  });
                  controller.enqueue(encoder.encode(sseEvent("tool_result", {
                    tool_use_id: tool.id,
                    result: "Landing page fetched successfully.",
                  })));
                } catch (err) {
                  const errorMsg = err instanceof Error ? err.message : "Failed to fetch landing page";
                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: tool.id,
                    content: `Error: ${errorMsg}`,
                    is_error: true,
                  });
                }
              }
            }

            // Append the assistant turn and tool results to continue the conversation
            // We need the full assistant content, but we only have tool_use blocks collected
            // The streamed text was sent already, so reconstruct a minimal assistant message
            messages = [
              ...messages,
              {
                role: "assistant" as const,
                content: assistantBlocks,
              },
              {
                role: "user" as const,
                content: toolResults,
              },
            ];
          }

          if (iterations >= MAX_TOOL_ITERATIONS) {
            controller.enqueue(encoder.encode(sseEvent("text_delta", {
              text: "\n\n*I've reached the maximum number of tool operations for this response. Please send a follow-up message if you need more analysis.*",
            })));
          }
          controller.enqueue(encoder.encode(sseEvent("done", {})));
          controller.close();
        } catch (err) {
          try {
            const msg = err instanceof Error ? err.message : "Internal error";
            controller.enqueue(encoder.encode(sseEvent("error", { message: msg })));
          } catch {
            // Controller may already be closed
          }
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
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
