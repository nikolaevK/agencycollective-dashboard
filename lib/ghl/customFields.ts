// Contact custom fields — resolve by display NAME (ids differ per sub-account)
// and write values onto a contact. Used by the deal → GHL proposal sync
// (lib/ghlDealSync.ts) for the "Proposal Link" fields GHL workflows merge into
// follow-up emails / SMS.

import cache from "@/lib/cache";
import { ghlRequest, getGhlConfig } from "./client";
import { DEFAULT_SUB_ACCOUNT_ID, type GhlSubAccountId } from "./subAccounts";
import { pickStr, cachedSingleflight } from "./util";

const TTL_FIELDS = 600;

interface ContactField {
  id: string;
  name: string;
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

async function listContactFields(subAccountId: GhlSubAccountId): Promise<ContactField[]> {
  const { locationId } = getGhlConfig(subAccountId);
  return cachedSingleflight(`ghl:contact-fields:${subAccountId}:${locationId}`, TTL_FIELDS, async () => {
    const raw = await ghlRequest<{ customFields?: unknown[] }>(
      `/locations/${encodeURIComponent(locationId)}/customFields`,
      { query: { model: "contact" }, subAccountId }
    );
    return (raw.customFields ?? [])
      .map((f) => ({ id: pickStr(f, "id") ?? "", name: pickStr(f, "name") ?? "" }))
      .filter((f) => f.id && f.name);
  });
}

/**
 * Map each wanted field name to its id in this sub-account (case/whitespace
 * tolerant). Missing names are absent from the map — the caller logs them.
 */
export async function resolveContactFieldIds(
  names: readonly string[],
  subAccountId: GhlSubAccountId = DEFAULT_SUB_ACCOUNT_ID
): Promise<Map<string, string>> {
  const fields = await listContactFields(subAccountId);
  const byName = new Map(fields.map((f) => [normalizeName(f.name), f.id]));
  const out = new Map<string, string>();
  for (const name of names) {
    const id = byName.get(normalizeName(name));
    if (id) out.set(name, id);
  }
  return out;
}

/**
 * Write custom-field values onto a contact (PUT /contacts/:id — only the
 * listed fields change). Returns the values GHL reports back, keyed by field
 * id, so the caller can verify the write landed (a field GHL omits = empty).
 */
export async function updateContactCustomFields(
  contactId: string,
  values: Array<{ id: string; value: string | number }>,
  subAccountId: GhlSubAccountId = DEFAULT_SUB_ACCOUNT_ID
): Promise<Map<string, string>> {
  const raw = await ghlRequest<{ contact?: { customFields?: unknown[] } }>(
    `/contacts/${encodeURIComponent(contactId)}`,
    {
      method: "PUT",
      body: { customFields: values.map((v) => ({ id: v.id, field_value: v.value })) },
      subAccountId,
    }
  );
  cache.delete(`ghl:contact-by-id:${subAccountId}:${contactId}`);
  const observed = new Map<string, string>();
  for (const f of raw?.contact?.customFields ?? []) {
    const id = pickStr(f, "id");
    if (!id) continue;
    const v = (f as Record<string, unknown>).value;
    observed.set(id, typeof v === "string" ? v : v == null ? "" : String(v));
  }
  return observed;
}
