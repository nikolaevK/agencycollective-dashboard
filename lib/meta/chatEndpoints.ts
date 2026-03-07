/**
 * Chat-specific Meta Graph API endpoints.
 * These fetch richer data than the dashboard needs — not cached in the shared
 * dashboard cache, so they don't pollute AccountSummary[] types.
 */

import { z } from "zod";
import { metaFetch } from "./client";
import { dateRangeToMetaParams } from "@/lib/utils";
import type { DateRangeInput } from "@/types/api";

// ─── Shared helpers ────────────────────────────────────────────────────────

const numStr = z
  .union([
    z.string().transform((v) => parseFloat(v) || 0),
    z.number(),
    z.null().transform(() => 0),
  ])
  .optional()
  .default(0);

const ActionSchema = z.object({
  action_type: z.string(),
  value: numStr,
});

function paginatedOf<T extends z.ZodTypeAny>(schema: T) {
  return z.object({ data: z.array(schema) }).passthrough();
}

const PURCHASE_TYPES = ["offsite_conversion.fb_pixel_purchase"];
const FUNNEL_TYPES: Record<string, string> = {
  "view_content":                          "View Content",
  "add_to_cart":                           "Add to Cart",
  "initiate_checkout":                     "Initiate Checkout",
  "add_payment_info":                      "Add Payment Info",
  "offsite_conversion.fb_pixel_purchase":  "Purchase",
  "purchase":                              "Purchase (app)",
  "lead":                                  "Lead",
  "complete_registration":                 "Registration",
  "subscribe":                             "Subscribe",
  "contact":                               "Contact",
};

function extractActions(actions: Array<{ action_type: string; value: number }> | null | undefined) {
  const result: Record<string, number> = {};
  for (const a of actions ?? []) {
    if (FUNNEL_TYPES[a.action_type]) {
      result[a.action_type] = (result[a.action_type] ?? 0) + a.value;
    }
  }
  return result;
}

function extractRoas(roasArr: Array<{ action_type: string; value: number }> | null | undefined): number {
  return roasArr?.[0]?.value ?? 0;
}

function extractPurchases(actions: Array<{ action_type: string; value: number }> | null | undefined): number {
  return (actions ?? [])
    .filter((a) => PURCHASE_TYPES.includes(a.action_type))
    .reduce((s, a) => s + a.value, 0);
}

// ─── Demographic Breakdown (age + gender) ─────────────────────────────────

const DemographicRowSchema = z.object({
  age:    z.string().optional().default(""),
  gender: z.string().optional().default(""),
  spend:       numStr,
  impressions: numStr,
  clicks:      numStr,
  ctr:         numStr,
  cpc:         numStr,
  frequency:   numStr,
  actions:             z.array(ActionSchema).nullish(),
  action_values:       z.array(ActionSchema).nullish(),
  website_purchase_roas: z.array(ActionSchema).nullish(),
}).passthrough();

type DemographicRowRaw = z.infer<typeof DemographicRowSchema>;

export interface DemographicRow {
  age: string;
  gender: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  frequency: number;
  roas: number;
  conversions: number;
}

function parseDemographicRow(raw: DemographicRowRaw): DemographicRow {
  return {
    age:         raw.age || "unknown",
    gender:      raw.gender || "unknown",
    spend:       raw.spend,
    impressions: raw.impressions,
    clicks:      raw.clicks,
    ctr:         raw.ctr,
    cpc:         raw.cpc,
    frequency:   raw.frequency,
    roas:        extractRoas(raw.website_purchase_roas as Array<{ action_type: string; value: number }> | null),
    conversions: extractPurchases(raw.actions as Array<{ action_type: string; value: number }> | null),
  };
}

export async function fetchDemographicBreakdown(
  accountId: string,
  dateRange: DateRangeInput
): Promise<DemographicRow[]> {
  const cleanId = accountId.replace(/^act_/, "");
  const metaParams = dateRangeToMetaParams(dateRange);

  const page = await metaFetch(
    `/act_${cleanId}/insights`,
    paginatedOf(DemographicRowSchema),
    {
      params: {
        fields: "spend,impressions,clicks,ctr,cpc,frequency,actions,action_values,website_purchase_roas",
        breakdowns: "age,gender",
        level: "account",
        limit: 200,
        ...metaParams,
      },
    }
  );

  return (page.data as DemographicRowRaw[])
    .map(parseDemographicRow)
    .sort((a, b) => b.spend - a.spend);
}

// ─── Placement Breakdown (publisher_platform + platform_position) ──────────

const PlacementRowSchema = z.object({
  publisher_platform: z.string().optional().default(""),
  platform_position:  z.string().optional().default(""),
  spend:       numStr,
  impressions: numStr,
  clicks:      numStr,
  ctr:         numStr,
  cpc:         numStr,
  actions:               z.array(ActionSchema).nullish(),
  action_values:         z.array(ActionSchema).nullish(),
  website_purchase_roas: z.array(ActionSchema).nullish(),
}).passthrough();

type PlacementRowRaw = z.infer<typeof PlacementRowSchema>;

export interface PlacementRow {
  platform: string;
  position: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  roas: number;
  conversions: number;
}

function parsePlacementRow(raw: PlacementRowRaw): PlacementRow {
  return {
    platform:    raw.publisher_platform || "unknown",
    position:    raw.platform_position || "unknown",
    spend:       raw.spend,
    impressions: raw.impressions,
    clicks:      raw.clicks,
    ctr:         raw.ctr,
    cpc:         raw.cpc,
    roas:        extractRoas(raw.website_purchase_roas as Array<{ action_type: string; value: number }> | null),
    conversions: extractPurchases(raw.actions as Array<{ action_type: string; value: number }> | null),
  };
}

export async function fetchPlacementBreakdown(
  accountId: string,
  dateRange: DateRangeInput
): Promise<PlacementRow[]> {
  const cleanId = accountId.replace(/^act_/, "");
  const metaParams = dateRangeToMetaParams(dateRange);

  const page = await metaFetch(
    `/act_${cleanId}/insights`,
    paginatedOf(PlacementRowSchema),
    {
      params: {
        fields: "spend,impressions,clicks,ctr,cpc,actions,action_values,website_purchase_roas",
        breakdowns: "publisher_platform,platform_position",
        level: "account",
        limit: 200,
        ...metaParams,
      },
    }
  );

  return (page.data as PlacementRowRaw[])
    .map(parsePlacementRow)
    .sort((a, b) => b.spend - a.spend);
}

// ─── Ad Set Learning Stages ────────────────────────────────────────────────

const AdSetLearningSchema = z.object({
  id:   z.string(),
  name: z.string(),
  effective_status: z.string(),
  optimization_goal: z.string().optional().default(""),
  learning_stage_info: z.object({
    status: z.string(),
    conversions_required: z.number().optional(),
    last_sig_edit_ts: z.number().optional(),
  }).nullish(),
}).passthrough();

const AdSetsPaginatedSchema = z.object({
  data: z.array(AdSetLearningSchema),
  paging: z.object({
    cursors: z.object({ before: z.string(), after: z.string() }).optional(),
    next: z.string().optional(),
  }).optional(),
});

export interface AdSetLearning {
  id: string;
  name: string;
  status: string;
  optimizationGoal: string;
  learningStatus: string;           // LEARNING | NOT_IN_LEARNING | LEARNING_LIMITED | null
  conversionsRequired?: number;
}

const MAX_PAGINATION_PAGES = 10;

export async function fetchAdSetLearningStages(
  accountId: string
): Promise<AdSetLearning[]> {
  const cleanId = accountId.replace(/^act_/, "");

  let all: AdSetLearning[] = [];
  let afterCursor: string | undefined;
  let pages = 0;

  do {
    if (pages >= MAX_PAGINATION_PAGES) break;
    pages++;

    const page = await metaFetch(
      `/act_${cleanId}/adsets`,
      AdSetsPaginatedSchema,
      {
        params: {
          fields: "id,name,effective_status,optimization_goal,learning_stage_info",
          filtering: JSON.stringify([{ field: "effective_status", operator: "IN", value: ["ACTIVE"] }]),
          limit: 100,
          after: afterCursor,
        },
      }
    );

    for (const row of page.data) {
      all.push({
        id:                 row.id,
        name:               row.name,
        status:             row.effective_status,
        optimizationGoal:   row.optimization_goal ?? "",
        learningStatus:     row.learning_stage_info?.status ?? "UNKNOWN",
        conversionsRequired: row.learning_stage_info?.conversions_required,
      });
    }

    afterCursor = page.paging?.cursors?.after;
    if (!page.paging?.next) break;
  } while (afterCursor);

  return all;
}

// ─── Custom Conversions ────────────────────────────────────────────────────

const CustomConversionSchema = z.object({
  id:                z.string(),
  name:              z.string(),
  custom_event_type: z.string().optional().default(""),
}).passthrough();

const CustomConversionsPaginatedSchema = z.object({
  data: z.array(CustomConversionSchema),
  paging: z.object({
    cursors: z.object({ before: z.string(), after: z.string() }).optional(),
    next: z.string().optional(),
  }).optional(),
});

export interface CustomConversion {
  id: string;
  name: string;
  eventType: string;
}

export async function fetchCustomConversions(
  accountId: string
): Promise<CustomConversion[]> {
  const cleanId = accountId.replace(/^act_/, "");
  const all: CustomConversion[] = [];
  let afterCursor: string | undefined;
  let pages = 0;

  do {
    if (pages >= MAX_PAGINATION_PAGES) break;
    pages++;

    const page = await metaFetch(
      `/act_${cleanId}/customconversions`,
      CustomConversionsPaginatedSchema,
      { params: { fields: "id,name,custom_event_type", limit: 100, after: afterCursor } }
    );
    for (const c of page.data) {
      all.push({ id: c.id, name: c.name, eventType: c.custom_event_type ?? "" });
    }
    afterCursor = page.paging?.cursors?.after;
    if (!page.paging?.next) break;
  } while (afterCursor);

  return all;
}

// ─── Conversion Breakdown (all events + custom conversions decoded) ─────────

const ConversionInsightSchema = z.object({
  spend:         numStr,
  actions:       z.array(ActionSchema).nullish(),
  action_values: z.array(ActionSchema).nullish(),
}).passthrough();

export interface ConversionEvent {
  label:    string;
  count:    number;
  value:    number;   // revenue if applicable
  category: "standard" | "custom" | "other";
}

// Standard action types shown beyond purchases — ordered by funnel stage
const STANDARD_EVENT_LABELS: Record<string, string> = {
  "view_content":                           "View Content",
  "add_to_cart":                            "Add to Cart",
  "add_to_wishlist":                        "Add to Wishlist",
  "initiate_checkout":                      "Initiate Checkout",
  "add_payment_info":                       "Add Payment Info",
  "offsite_conversion.fb_pixel_purchase":   "Purchase (pixel)",
  "purchase":                               "Purchase (app/omni)",
  "omni_purchase":                          "Purchase (omni)",
  "lead":                                   "Lead",
  "offsite_conversion.fb_pixel_lead":       "Lead (pixel)",
  "complete_registration":                  "Registration",
  "subscribe":                              "Subscribe",
  "contact":                                "Contact",
  "find_location":                          "Find Location",
  "schedule":                               "Schedule",
  "start_trial":                            "Start Trial",
};

export async function fetchConversionBreakdown(
  accountId: string,
  dateRange: DateRangeInput,
  customConversions: CustomConversion[]
): Promise<ConversionEvent[]> {
  const cleanId = accountId.replace(/^act_/, "");
  const metaParams = dateRangeToMetaParams(dateRange);

  // Build a map of custom conversion ID → name for decoding action_types
  const customMap = new Map<string, string>(
    customConversions.map((c) => [`offsite_conversion.custom.${c.id}`, c.name])
  );

  const page = await metaFetch(
    `/act_${cleanId}/insights`,
    z.object({ data: z.array(ConversionInsightSchema) }).passthrough(),
    {
      params: {
        fields: "spend,actions,action_values",
        level: "account",
        limit: 1,
        ...metaParams,
      },
    }
  );

  const raw = page.data[0];
  if (!raw) return [];

  const actions      = (raw.actions      ?? []) as Array<{ action_type: string; value: number }>;
  const actionValues = (raw.action_values ?? []) as Array<{ action_type: string; value: number }>;

  // Build a revenue map from action_values
  const revenueMap = new Map<string, number>();
  for (const av of actionValues) {
    revenueMap.set(av.action_type, (revenueMap.get(av.action_type) ?? 0) + av.value);
  }

  // Collect all unique action types and their counts
  const countMap = new Map<string, number>();
  for (const a of actions) {
    countMap.set(a.action_type, (countMap.get(a.action_type) ?? 0) + a.value);
  }

  const events: ConversionEvent[] = [];

  // 1. Standard events (in funnel order)
  for (const [type, label] of Object.entries(STANDARD_EVENT_LABELS)) {
    const count = countMap.get(type);
    if (count && count > 0) {
      events.push({
        label,
        count: Math.round(count),
        value: revenueMap.get(type) ?? 0,
        category: "standard",
      });
    }
  }

  // 2. Custom conversions (named)
  for (const [type, name] of Array.from(customMap)) {
    const count = countMap.get(type);
    if (count && count > 0) {
      events.push({
        label: name,
        count: Math.round(count),
        value: revenueMap.get(type) ?? 0,
        category: "custom",
      });
    }
  }

  return events;
}

// ─── Context formatters ────────────────────────────────────────────────────

export function formatConversionBreakdown(
  events: ConversionEvent[],
  accountName: string,
  currency: string
): string {
  if (events.length === 0) return "";

  const standard = events.filter((e) => e.category === "standard");
  const custom   = events.filter((e) => e.category === "custom");

  const lines: string[] = [`\n## Conversion Events — ${accountName}\n`];

  if (standard.length > 0) {
    lines.push("**Standard Events**");
    lines.push("| Event | Count | Revenue |");
    lines.push("|-------|------:|--------:|");
    for (const e of standard) {
      const revenue = e.value > 0 ? formatMoney(e.value, currency) : "—";
      lines.push(`| ${e.label} | ${e.count.toLocaleString()} | ${revenue} |`);
    }
  }

  if (custom.length > 0) {
    lines.push("");
    lines.push("**Custom Conversions**");
    lines.push("| Conversion | Count | Revenue |");
    lines.push("|------------|------:|--------:|");
    for (const e of custom) {
      const revenue = e.value > 0 ? formatMoney(e.value, currency) : "—";
      lines.push(`| ${e.label} | ${e.count.toLocaleString()} | ${revenue} |`);
    }
  }

  return lines.join("\n");
}

export function formatFunnelActions(
  actions: Array<{ action_type: string; value: number }> | null | undefined,
  currency: string
): string {
  const extracted = extractActions(actions);
  const lines: string[] = [];
  for (const [type, label] of Object.entries(FUNNEL_TYPES)) {
    const val = extracted[type];
    if (val != null && val > 0) {
      lines.push(`  ${label}: ${Math.round(val)}`);
    }
  }
  return lines.length > 0 ? `  Funnel actions:\n${lines.join("\n")}` : "";
}

export function formatDemographicTable(
  rows: DemographicRow[],
  accountName: string,
  currency: string
): string {
  if (rows.length === 0) return "";
  const cap = rows.slice(0, 16); // max 16 rows (8 age groups × 2 genders)

  const header = `\n## Age/Gender Breakdown — ${accountName}\n\n| Age | Gender | Spend | ROAS | CTR | Freq | Conv |`;
  const divider = "|-----|--------|-------|------|-----|------|------|";
  const tableRows = cap.map((r) =>
    `| ${r.age} | ${r.gender} | ${formatMoney(r.spend, currency)} | ${r.roas.toFixed(2)}x | ${r.ctr.toFixed(2)}% | ${r.frequency.toFixed(1)} | ${Math.round(r.conversions)} |`
  );

  return [header, divider, ...tableRows].join("\n");
}

export function formatPlacementTable(
  rows: PlacementRow[],
  accountName: string,
  currency: string
): string {
  if (rows.length === 0) return "";
  const cap = rows.slice(0, 15);

  const header = `\n## Placement Breakdown — ${accountName}\n\n| Platform | Position | Spend | ROAS | CTR | Conv |`;
  const divider = "|----------|----------|-------|------|-----|------|";
  const tableRows = cap.map((r) =>
    `| ${r.platform} | ${r.position} | ${formatMoney(r.spend, currency)} | ${r.roas.toFixed(2)}x | ${r.ctr.toFixed(2)}% | ${Math.round(r.conversions)} |`
  );

  return [header, divider, ...tableRows].join("\n");
}

export function formatLearningStages(
  adSets: AdSetLearning[],
  accountName: string
): string {
  const learning        = adSets.filter((a) => a.learningStatus === "LEARNING");
  const limited         = adSets.filter((a) => a.learningStatus === "LEARNING_LIMITED");
  const stable          = adSets.filter((a) => a.learningStatus === "NOT_IN_LEARNING");

  if (adSets.length === 0) return "";

  const lines = [`\n## Active Ad Set Learning Stages — ${accountName}\n`];
  if (learning.length)  lines.push(`  In Learning (${learning.length}): ${learning.map((a) => a.name).join(", ")}`);
  if (limited.length)   lines.push(`  Learning Limited (${limited.length}): ${limited.map((a) => a.name).join(", ")}`);
  if (stable.length)    lines.push(`  Stable/Exited Learning (${stable.length}): ${stable.slice(0, 5).map((a) => a.name).join(", ")}${stable.length > 5 ? ` +${stable.length - 5} more` : ""}`);

  return lines.join("\n");
}

function formatMoney(value: number, currency: string): string {
  if (value >= 1_000_000) return `${currency}${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000)     return `${currency}${(value / 1_000).toFixed(1)}K`;
  return `${currency}${value.toFixed(0)}`;
}
