/**
 * Raw wire-format interfaces matching Meta Graph API responses.
 * Numbers come back as strings from Meta's API.
 */

export interface MetaAdAccount {
  id: string;           // "act_123456789"
  name: string;
  currency: string;
  timezone_name: string;
  account_status: number; // 1=ACTIVE, 2=DISABLED, 3=UNSETTLED, 7=PENDING_RISK_REVIEW, 9=IN_GRACE_PERIOD, 100=PENDING_CLOSURE, 101=CLOSED, 201=ANY_ACTIVE, 202=ANY_CLOSED
  business_name?: string;
}

export interface MetaActionValue {
  action_type: string;
  value: string; // numeric string
}

export interface MetaAction {
  action_type: string;
  value: string; // numeric string
}

export interface MetaInsight {
  account_id?: string;
  account_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  date_start?: string;
  date_stop?: string;
  spend: string;               // numeric string
  impressions: string;         // numeric string
  reach: string;               // numeric string
  clicks: string;              // numeric string
  ctr?: string;                // numeric string, percent
  cpc?: string;                // numeric string
  cpm?: string;                // numeric string
  actions?: MetaAction[];
  action_values?: MetaActionValue[];
  outbound_clicks?: MetaAction[];
  website_purchase_roas?: MetaActionValue[];
}

export interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  objective: string;
  budget_remaining?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
  account_id: string;
  insights?: { data: MetaInsight[] };
}

export interface MetaAdSet {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  campaign_id: string;
  daily_budget?: string;
  lifetime_budget?: string;
  billing_event: string;
  optimization_goal: string;
  start_time?: string;
  end_time?: string;
  insights?: { data: MetaInsight[] };
}

export interface MetaAd {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  adset_id: string;
  campaign_id: string;
  creative?: { id: string };
  preview_shareable_link?: string;
  insights?: { data: MetaInsight[] };
}

export interface MetaApiError {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

export interface MetaApiErrorResponse {
  error: MetaApiError;
}

export interface MetaPaginatedResponse<T> {
  data: T[];
  paging?: {
    cursors?: { before: string; after: string };
    next?: string;
  };
}
