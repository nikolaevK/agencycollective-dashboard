import { ghlRequest, getGhlConfig, GhlApiError } from "./client";
import {
  DEFAULT_SUB_ACCOUNT_ID,
  type GhlSubAccountId,
} from "./subAccounts";
import { pickStr, cachedSingleflight } from "./util";
import type { GhlUser } from "@/types/ghl";

const TTL_USERS = 600;
// Memoize the resolved /users/* path per sub-account so we don't pay the
// 3-step probe cost every 10 minutes. Each PIT may have different scopes
// and a different working endpoint shape.
const resolvedUsersPathBySub = new Map<
  GhlSubAccountId,
  (locationId: string, subAccountId: GhlSubAccountId) => Promise<unknown>
>();

function normUser(raw: Record<string, unknown>): GhlUser {
  const id = pickStr(raw, "id", "_id") ?? "";
  const first = pickStr(raw, "firstName", "first_name") ?? "";
  const last = pickStr(raw, "lastName", "last_name") ?? "";
  const email = pickStr(raw, "email");
  const composed = [first, last].filter(Boolean).join(" ").trim();
  const explicitName = pickStr(raw, "name", "fullName", "full_name");
  return {
    id,
    name: composed || explicitName || email,
    email,
  };
}

/**
 * GHL has shipped this catalog through three different paths/param names
 * across API versions, and which one your PIT is allowed to call depends on
 * whether the integration was created at agency or sub-account level. Try
 * each in order, fall through any that 404/422/401/403, and hand back
 * whatever the first successful call gives us.
 */
async function tryListUsers(
  locationId: string,
  subAccountId: GhlSubAccountId
): Promise<unknown[]> {
  // Fast path: if a previous call resolved a working path, use it directly.
  const cachedFn = resolvedUsersPathBySub.get(subAccountId);
  if (cachedFn) {
    try {
      const raw = await cachedFn(locationId, subAccountId);
      return extractUsersFromRaw(raw);
    } catch (err) {
      // If the cached path now 404s/etc, fall through to probe again. This
      // covers the case of GHL deprecating an endpoint mid-process-life.
      if (!(err instanceof GhlApiError) ||
          ![404, 422, 401, 403].includes(err.status)) {
        throw err;
      }
      resolvedUsersPathBySub.delete(subAccountId);
    }
  }

  const attempts: Array<{
    fn: (loc: string, sub: GhlSubAccountId) => Promise<unknown>;
    label: string;
  }> = [
    {
      fn: (loc, sub) => ghlRequest("/users/", { query: { locationId: loc }, subAccountId: sub }),
      label: "/users/",
    },
    {
      fn: (loc, sub) => ghlRequest("/users/search", { query: { locationId: loc }, subAccountId: sub }),
      label: "/users/search",
    },
    {
      fn: (loc, sub) => ghlRequest(`/locations/${encodeURIComponent(loc)}/users`, { subAccountId: sub }),
      label: "/locations/{id}/users",
    },
  ];
  for (const attempt of attempts) {
    try {
      const raw = await attempt.fn(locationId, subAccountId);
      // Remember the winning path so subsequent cache misses skip the probe.
      resolvedUsersPathBySub.set(subAccountId, attempt.fn);
      return extractUsersFromRaw(raw);
    } catch (err) {
      if (
        err instanceof GhlApiError &&
        (err.status === 404 || err.status === 422 || err.status === 401 || err.status === 403)
      ) {
        continue;
      }
      throw err;
    }
  }
  return [];
}

function extractUsersFromRaw(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const top = raw as Record<string, unknown>;
    if (Array.isArray(top.users)) return top.users as unknown[];
    if (Array.isArray(top.data)) return top.data as unknown[];
  }
  return [];
}

export async function listLocationUsers(
  subAccountId: GhlSubAccountId = DEFAULT_SUB_ACCOUNT_ID
): Promise<GhlUser[]> {
  const { locationId } = getGhlConfig(subAccountId);
  return cachedSingleflight(`ghl:users:${subAccountId}:${locationId}`, TTL_USERS, async () => {
    const raw = await tryListUsers(locationId, subAccountId);
    return raw
      .map((u) => normUser(u as Record<string, unknown>))
      .filter((u) => u.id);
  });
}

export async function getUserMap(
  subAccountId: GhlSubAccountId = DEFAULT_SUB_ACCOUNT_ID
): Promise<Record<string, GhlUser>> {
  const { locationId } = getGhlConfig(subAccountId);
  return cachedSingleflight(`ghl:users-map:${subAccountId}:${locationId}`, TTL_USERS, async () => {
    const users = await listLocationUsers(subAccountId);
    const out: Record<string, GhlUser> = {};
    for (const u of users) out[u.id] = u;
    return out;
  });
}
