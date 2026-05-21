import { ghlRequest, getGhlConfig } from "./client";
import {
  DEFAULT_SUB_ACCOUNT_ID,
  type GhlSubAccountId,
} from "./subAccounts";
import { pickStr, cachedSingleflight } from "./util";
import type { GhlTag } from "@/types/ghl";

const TTL_TAGS = 600;

function normTag(raw: Record<string, unknown>): GhlTag {
  const name = pickStr(raw, "name") ?? "";
  const id = pickStr(raw, "id", "_id") ?? name;
  return { id, name };
}

/**
 * Lists every tag defined at the configured GHL location. Used by the contact
 * list's tag picker.
 */
export async function listLocationTags(
  subAccountId: GhlSubAccountId = DEFAULT_SUB_ACCOUNT_ID
): Promise<GhlTag[]> {
  const { locationId } = getGhlConfig(subAccountId);
  return cachedSingleflight(
    `ghl:tags:${subAccountId}:${locationId}`,
    TTL_TAGS,
    async () => {
      const raw = await ghlRequest<unknown>(
        `/locations/${encodeURIComponent(locationId)}/tags`,
        { subAccountId }
      );

      let list: unknown[] = [];
      if (Array.isArray(raw)) {
        list = raw;
      } else if (raw && typeof raw === "object") {
        const top = raw as Record<string, unknown>;
        if (Array.isArray(top.tags)) list = top.tags as unknown[];
        else if (Array.isArray(top.data)) list = top.data as unknown[];
      }

      return list
        .map((t) => normTag(t as Record<string, unknown>))
        .filter((t) => t.name.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  );
}
