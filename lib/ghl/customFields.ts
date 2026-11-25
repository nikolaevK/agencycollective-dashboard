// Contact custom fields — resolve by display NAME (ids differ per sub-account),
// create a missing text field, and write values onto a contact. Used by the
// deal → GHL proposal sync (lib/ghlDealSync.ts) for the "Proposal …" fields
// GHL workflows merge into follow-up emails / SMS.

import cache from "@/lib/cache";
import { ghlRequest, getGhlConfig } from "./client";
import { DEFAULT_SUB_ACCOUNT_ID, type GhlSubAccountId } from "./subAccounts";
import { pickStr, cachedSingleflight } from "./util";

const TTL_FIELDS = 600;

export interface ContactField {
  id: string;
  name: string;
}

const fieldsKey = (subAccountId: GhlSubAccountId) =>
  `ghl:contact-fields:${subAccountId}:${getGhlConfig(subAccountId).locationId}`;

/** The sub-account's contact custom fields (cached; `fresh` re-reads GHL). */
export async function listContactFields(
  subAccountId: GhlSubAccountId = DEFAULT_SUB_ACCOUNT_ID,
  opts: { fresh?: boolean } = {}
): Promise<ContactField[]> {
  const { locationId } = getGhlConfig(subAccountId);
  if (opts.fresh) cache.delete(fieldsKey(subAccountId));
  return cachedSingleflight(fieldsKey(subAccountId), TTL_FIELDS, async () => {
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
 * Create a single-line text contact field (POST /locations/:id/customFields —
 * needs the token's locations/customFields.write scope). Returns the new
 * field; the cached field list is dropped so the next read sees it.
 */
export async function createContactTextField(
  name: string,
  subAccountId: GhlSubAccountId = DEFAULT_SUB_ACCOUNT_ID
): Promise<ContactField> {
  const { locationId } = getGhlConfig(subAccountId);
  const raw = await ghlRequest<{ customField?: unknown }>(`/locations/${encodeURIComponent(locationId)}/customFields`, {
    method: "POST",
    body: { name, dataType: "TEXT", model: "contact" },
    subAccountId,
  });
  cache.delete(fieldsKey(subAccountId));
  const id = pickStr(raw?.customField, "id");
  if (!id) throw new Error(`GHL created no id for custom field "${name}"`);
  return { id, name: pickStr(raw?.customField, "name") ?? name };
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
