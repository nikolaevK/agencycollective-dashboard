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
    `ghl:opps-by-contact:${subAccountId}:${locationId}`,
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
