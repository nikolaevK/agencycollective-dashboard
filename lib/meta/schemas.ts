import { z } from "zod";

/**
 * Transform a numeric string (as returned by Meta API) to a number
 */
const numericString = z
  .string()
  .transform((val) => {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
  })
  .or(z.number());

const optionalNumericString = numericString.optional().default("0");

export const MetaActionValueSchema = z.object({
  action_type: z.string(),
  value: numericString,
});

export const MetaActionSchema = z.object({
  action_type: z.string(),
  value: numericString,
});

export const MetaInsightSchema = z.object({
  account_id: z.string().optional(),
  account_name: z.string().optional(),
  campaign_id: z.string().optional(),
  campaign_name: z.string().optional(),
  adset_id: z.string().optional(),
  adset_name: z.string().optional(),
  ad_id: z.string().optional(),
  ad_name: z.string().optional(),
  date_start: z.string().optional(),
  date_stop: z.string().optional(),
  spend: numericString,
  impressions: numericString,
  reach: numericString,
  clicks: numericString,
  ctr: optionalNumericString,
  cpc: optionalNumericString,
  cpm: optionalNumericString,
  actions: z.array(MetaActionSchema).optional(),
  action_values: z.array(MetaActionValueSchema).optional(),
  outbound_clicks: z.array(MetaActionSchema).optional(),
  website_purchase_roas: z.array(MetaActionValueSchema).optional(),
});

export type MetaInsightParsed = z.infer<typeof MetaInsightSchema>;

export const MetaAdAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  currency: z.string().default("USD"),
  timezone_name: z.string().default("UTC"),
  account_status: z.number(),
  business_name: z.string().optional(),
});

export const MetaCampaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  effective_status: z.string(),
  objective: z.string().default(""),
  budget_remaining: numericString.optional(),
  daily_budget: numericString.optional(),
  lifetime_budget: numericString.optional(),
  start_time: z.string().optional(),
  stop_time: z.string().optional(),
  account_id: z.string(),
  insights: z
    .object({ data: z.array(MetaInsightSchema) })
    .optional(),
});

export const MetaAdSetSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  effective_status: z.string(),
  campaign_id: z.string(),
  daily_budget: numericString.optional(),
  lifetime_budget: numericString.optional(),
  billing_event: z.string().default(""),
  optimization_goal: z.string().default(""),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  insights: z
    .object({ data: z.array(MetaInsightSchema) })
    .optional(),
});

export const MetaAdSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  effective_status: z.string(),
  adset_id: z.string(),
  campaign_id: z.string(),
  creative: z.object({ id: z.string() }).optional(),
  preview_shareable_link: z.string().optional(),
  insights: z
    .object({ data: z.array(MetaInsightSchema) })
    .optional(),
});

export const MetaCreativeDetailSchema = z
  .object({
    id: z.string(),
    image_url: z.string().optional(),
    thumbnail_url: z.string().optional(),
    image_hash: z.string().optional(),
    video_data: z
      .object({ thumbnail_url: z.string().optional() })
      .passthrough()
      .optional(),
    object_story_spec: z
      .object({
        link_data: z
          .object({
            picture: z.string().optional(),
            image_url: z.string().optional(),
            image_hash: z.string().optional(),
          })
          .passthrough()
          .optional(),
        photo_data: z
          .object({
            images: z.record(z.object({ url: z.string().optional() }).passthrough()).optional(),
          })
          .passthrough()
          .optional(),
        video_data: z
          .object({ image_url: z.string().optional() })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

/**
 * Standalone schema for top-ads response.
 * Uses passthrough() at every level so unexpected Meta fields don't fail validation.
 * Makes adset_id/campaign_id optional since some ad types may omit them.
 */
export const MetaAdWithCreativeSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: z.string(),
    effective_status: z.string(),
    adset_id: z.string().optional(),
    campaign_id: z.string().optional(),
    campaign: z.object({ name: z.string() }).passthrough().optional(),
    preview_shareable_link: z.string().optional(),
    creative: z
      .object({
        id: z.string(),
        image_url: z.string().optional(),
        thumbnail_url: z.string().optional(),
        video_data: z
          .object({ thumbnail_url: z.string().optional() })
          .optional(),
      })
      .passthrough()
      .optional(),
    insights: z
      .object({
        data: z.array(
          z
            .object({
              spend: numericString,
              impressions: numericString.optional(),
              clicks: numericString.optional(),
              ctr: numericString.optional(),
              cpc: numericString.optional(),
            })
            .passthrough()
        ),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const MetaPaginatedResponseSchema = <T extends z.ZodTypeAny>(
  itemSchema: T
) =>
  z.object({
    data: z.array(itemSchema),
    paging: z
      .object({
        cursors: z
          .object({ before: z.string(), after: z.string() })
          .optional(),
        next: z.string().optional(),
      })
      .optional(),
  });

export const MetaInsightsPaginatedSchema =
  MetaPaginatedResponseSchema(MetaInsightSchema);
export const MetaAccountsPaginatedSchema =
  MetaPaginatedResponseSchema(MetaAdAccountSchema);
export const MetaCampaignsPaginatedSchema =
  MetaPaginatedResponseSchema(MetaCampaignSchema);
export const MetaAdSetsPaginatedSchema =
  MetaPaginatedResponseSchema(MetaAdSetSchema);
export const MetaAdsPaginatedSchema =
  MetaPaginatedResponseSchema(MetaAdSchema);
export const MetaAdsWithCreativePaginatedSchema =
  MetaPaginatedResponseSchema(MetaAdWithCreativeSchema);
