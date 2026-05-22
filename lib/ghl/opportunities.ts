import cache from "@/lib/cache";
import { ghlRequest, getGhlConfig } from "./client";
import {
  DEFAULT_SUB_ACCOUNT_ID,
  type GhlSubAccountId,
} from "./subAccounts";
import { pickStr, pickNum, pickIso, cachedSingleflight } from "./util";
import type { GhlOpportunity } from "@/types/ghl";

const TTL_OPPS = 300;
const PAGE_LIMIT = 100;
const MAX_OPPORTUNITIES = 5000;
const VERSION = "2023-02-21";
// Bound parallel page fetches so a tenant with 5000+ opportunities doesn't
// fire 50 simultaneous requests through the rate limiter and starve every
// other GHL call. 5 in flight is plenty given each page is ~200ms RTT.
const PAGE_CONCURRENCY = 5;

function normOpp(raw: Record<string, unknown>): GhlOpportunity {
  return {
    id: pickStr(raw, "id", "_id") ?? "",
    name: pickStr(raw, "name"),
    contactId: pickStr(raw, "contactId", "contact_id", "contact.id") ?? "",
    pipelineId: pickStr(raw, "pipelineId", "pipeline_id") ?? "",
    pipelineStageId: pickStr(raw, "pipelineStageId", "pipeline_stage_id") ?? "",
    status: pickStr(raw, "status"),
    monetaryValue: pickNum(raw, "monetaryValue", "monetary_value", "value"),
    source: pickStr(raw, "source"),
    createdAt: pickIso(raw, "createdAt", "created_at", "dateAdded", "date_added"),
    updatedAt: pickIso(raw, "updatedAt", "updated_at", "dateUpdated", "date_updated"),
  };
}

interface RawOppPage {
  opportunities: GhlOpportunity[];
  total: number;
}

/** Cache key for the bulk opportunities-by-contact map. Exported so write
 *  paths (create/update opportunity) can bust it after a mutation, the same
 *  way the appointments module busts its bulk listing after a status PUT. */
export function opportunitiesByContactCacheKey(
  subAccountId: GhlSubAccountId,
  locationId: string
): string {
  return `ghl:opps-by-contact:${subAccountId}:${locationId}`;
}

/** Drop the cached opportunities-by-contact map for a sub-account so the next
 *  read reflects an opportunity we just created or moved. Best-effort: if the
 *  sub-account env is missing the caller already handled the unavailable path. */
export function invalidateOpportunitiesCache(subAccountId: GhlSubAccountId): void {
  try {
    const { locationId } = getGhlConfig(subAccountId);
    cache.delete(opportunitiesByContactCacheKey(subAccountId, locationId));
  } catch {
    // env missing — nothing cached for this sub-account anyway
  }
}

async function fetchOpportunitiesPage(
  locationId: string,
  page: number,
  subAccountId: GhlSubAccountId
): Promise<RawOppPage> {
  const raw = await ghlRequest<unknown>("/opportunities/search", {
    query: { location_id: locationId, limit: PAGE_LIMIT, page },
    version: VERSION,
    subAccountId,
  });
  let list: unknown[] = [];
  let total = 0;
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === "object") {
    const top = raw as Record<string, unknown>;
    if (Array.isArray(top.opportunities)) list = top.opportunities as unknown[];
    else if (Array.isArray(top.data)) list = top.data as unknown[];
    const meta = top.meta as Record<string, unknown> | undefined;
    if (meta && typeof meta.total === "number") total = meta.total;
  }
  return {
    opportunities: list.map((o) => normOpp(o as Record<string, unknown>)),
    total,
  };
}

/**
 * Paginates the location-wide /opportunities/search endpoint and returns a
 * Map<contactId, GhlOpportunity[]>. Page 1 reveals `meta.total`, after
 * which all remaining pages are fetched in parallel — total wall-clock is
 * ~2 round-trips regardless of opportunity count, instead of 13+ sequential.
 */
export async function getOpportunitiesByContact(
  subAccountId: GhlSubAccountId = DEFAULT_SUB_ACCOUNT_ID
): Promise<Map<string, GhlOpportunity[]>> {
  const { locationId } = getGhlConfig(subAccountId);
  return cachedSingleflight(
    opportunitiesByContactCacheKey(subAccountId, locationId),
    TTL_OPPS,
    async () => {
    const collected: GhlOpportunity[] = [];

    const first = await fetchOpportunitiesPage(locationId, 1, subAccountId);
    collected.push(...first.opportunities);

    const reportedTotal = first.total > 0 ? first.total : first.opportunities.length;
    const totalToLoad = Math.min(reportedTotal, MAX_OPPORTUNITIES);
    const totalPages = Math.ceil(totalToLoad / PAGE_LIMIT);

    if (totalPages > 1) {
      // Pages 2..N fetched in concurrency-bounded batches so the rate
      // limiter stays healthy under load.
      const pageNums = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
      for (let i = 0; i < pageNums.length; i += PAGE_CONCURRENCY) {
        const slice = pageNums.slice(i, i + PAGE_CONCURRENCY);
        const batch = await Promise.all(
          slice.map((p) => fetchOpportunitiesPage(locationId, p, subAccountId))
        );
        for (const page of batch) {
          collected.push(...page.opportunities);
          if (collected.length >= MAX_OPPORTUNITIES) break;
        }
        if (collected.length >= MAX_OPPORTUNITIES) break;
      }
    }

    const map = new Map<string, GhlOpportunity[]>();
    for (const o of collected) {
      if (!o.contactId) continue;
      const list = map.get(o.contactId) ?? [];
      list.push(o);
      map.set(o.contactId, list);
    }
    return map;
    }
  );
}

// ── Single-opportunity reads + writes (CRM funnel sync) ──────────────────
//
// These power lib/ghlCrmSync.ts: move a lead's opportunity into a target
// pipeline stage when they show / a deal is linked, and again when the deal
// is paid. Writes bust the bulk opportunities-by-contact cache so the contacts
// page reflects the change on its next refetch.

function unwrapOpportunity(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.opportunity && typeof obj.opportunity === "object") {
    return obj.opportunity as Record<string, unknown>;
  }
  return obj;
}

/**
 * Fetch a single contact's opportunities directly via the `contact_id` search
 * filter. Deliberately NOT the cached bulk map (`getOpportunitiesByContact`):
 * that map is capped at MAX_OPPORTUNITIES, so on a large location a contact's
 * opportunity could fall outside the cap and we'd wrongly think they have none
 * (then create a duplicate). A targeted search returns only this contact's
 * rows — a contact never has more than a handful, so one page (limit 100) is
 * always enough. Uncached so a just-created/-moved opportunity is seen fresh.
 */
export async function searchOpportunitiesByContact(
  contactId: string,
  subAccountId: GhlSubAccountId = DEFAULT_SUB_ACCOUNT_ID
): Promise<GhlOpportunity[]> {
  const { locationId } = getGhlConfig(subAccountId);
  const raw = await ghlRequest<unknown>("/opportunities/search", {
    query: { location_id: locationId, contact_id: contactId, limit: PAGE_LIMIT },
    version: VERSION,
    subAccountId,
  });
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === "object") {
    const top = raw as Record<string, unknown>;
    if (Array.isArray(top.opportunities)) list = top.opportunities as unknown[];
    else if (Array.isArray(top.data)) list = top.data as unknown[];
  }
  return list
    .map((o) => normOpp(o as Record<string, unknown>))
    .filter((o) => o.id);
}

/**
 * Find a contact's opportunity living in a specific pipeline, if any. Returns
 * the most recently updated match when a contact has several in the pipeline.
 */
export async function findOpportunityForContactInPipeline(
  contactId: string,
  pipelineId: string,
  subAccountId: GhlSubAccountId = DEFAULT_SUB_ACCOUNT_ID
): Promise<GhlOpportunity | null> {
  const opps = await searchOpportunitiesByContact(contactId, subAccountId);
  // Re-filter by contactId client-side as a safety net: if the server-side
  // contact_id filter were ever ignored we must never move a stranger's
  // opportunity that merely happens to sit in the target pipeline.
  const matches = opps.filter(
    (o) => o.contactId === contactId && o.pipelineId === pipelineId
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  return matches[0];
}

interface CreateOpportunityInput {
  contactId: string;
  pipelineId: string;
  pipelineStageId: string;
  name: string;
  /** GHL opportunity status — open | won | lost | abandoned. Defaults open. */
  status?: string;
  /** Dollars or cents? GHL stores the raw number you send; we pass 0 unless a
   *  caller has a meaningful value. */
  monetaryValue?: number;
}

/** Create a new opportunity in the given pipeline + stage. Busts the bulk
 *  cache on success. POST /opportunities/ (Version 2023-02-21). */
export async function createOpportunity(
  input: CreateOpportunityInput,
  subAccountId: GhlSubAccountId = DEFAULT_SUB_ACCOUNT_ID
): Promise<GhlOpportunity | null> {
  const { locationId } = getGhlConfig(subAccountId);
  const body: Record<string, unknown> = {
    locationId,
    contactId: input.contactId,
    pipelineId: input.pipelineId,
    pipelineStageId: input.pipelineStageId,
    name: input.name,
    status: input.status ?? "open",
  };
  if (typeof input.monetaryValue === "number") {
    body.monetaryValue = input.monetaryValue;
  }
  const raw = await ghlRequest<unknown>("/opportunities/", {
    method: "POST",
    body,
    version: VERSION,
    subAccountId,
  });
  invalidateOpportunitiesCache(subAccountId);
  const inner = unwrapOpportunity(raw);
  return inner ? normOpp(inner) : null;
}

interface UpdateOpportunityInput {
  pipelineId: string;
  pipelineStageId: string;
  /** Preserve the existing status unless the caller wants to change it. */
  status?: string;
  name?: string;
}

/** Move an existing opportunity to a new stage (and optionally status/name).
 *  GHL's update wants the pipelineId alongside the stage id, so we send both.
 *  Busts the bulk cache on success. PUT /opportunities/:id (Version 2023-02-21). */
export async function updateOpportunity(
  opportunityId: string,
  input: UpdateOpportunityInput,
  subAccountId: GhlSubAccountId = DEFAULT_SUB_ACCOUNT_ID
): Promise<GhlOpportunity | null> {
  const body: Record<string, unknown> = {
    pipelineId: input.pipelineId,
    pipelineStageId: input.pipelineStageId,
  };
  if (input.status) body.status = input.status;
  if (input.name) body.name = input.name;

  const raw = await ghlRequest<unknown>(
    `/opportunities/${encodeURIComponent(opportunityId)}`,
    {
      method: "PUT",
      body,
      version: VERSION,
      subAccountId,
    }
  );
  invalidateOpportunitiesCache(subAccountId);
  const inner = unwrapOpportunity(raw);
  return inner ? normOpp(inner) : null;
}
