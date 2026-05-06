import { ghlRequest, getGhlConfig, GhlApiError } from "./client";
import { pickStr, cachedSingleflight } from "./util";
import type { GhlUser } from "@/types/ghl";

const TTL_USERS = 600;
// Memoize the resolved /users/* path across cache misses so we don't pay
// the 3-step probe cost every 10 minutes.
let resolvedUsersPath: ((locationId: string) => Promise<unknown>) | null = null;

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
async function tryListUsers(locationId: string): Promise<unknown[]> {
  // Fast path: if a previous call resolved a working path, use it directly.
  if (resolvedUsersPath) {
    try {
      const raw = await resolvedUsersPath(locationId);
      return extractUsersFromRaw(raw);
    } catch (err) {
      // If the cached path now 404s/etc, fall through to probe again. This
      // covers the case of GHL deprecating an endpoint mid-process-life.
      if (!(err instanceof GhlApiError) ||
          ![404, 422, 401, 403].includes(err.status)) {
        throw err;
      }
      resolvedUsersPath = null;
    }
  }

  const attempts: Array<{ fn: (loc: string) => Promise<unknown>; label: string }> = [
    { fn: (loc) => ghlRequest("/users/", { query: { locationId: loc } }), label: "/users/" },
    { fn: (loc) => ghlRequest("/users/search", { query: { locationId: loc } }), label: "/users/search" },
    { fn: (loc) => ghlRequest(`/locations/${encodeURIComponent(loc)}/users`), label: "/locations/{id}/users" },
  ];
  for (const attempt of attempts) {
    try {
      const raw = await attempt.fn(locationId);
      // Remember the winning path so subsequent cache misses skip the probe.
      resolvedUsersPath = attempt.fn;
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

export async function listLocationUsers(): Promise<GhlUser[]> {
  const { locationId } = getGhlConfig();
  return cachedSingleflight(`ghl:users:${locationId}`, TTL_USERS, async () => {
    const raw = await tryListUsers(locationId);
    return raw
      .map((u) => normUser(u as Record<string, unknown>))
      .filter((u) => u.id);
  });
}

export async function getUserMap(): Promise<Record<string, GhlUser>> {
  const { locationId } = getGhlConfig();
  return cachedSingleflight(`ghl:users-map:${locationId}`, TTL_USERS, async () => {
    const users = await listLocationUsers();
    const out: Record<string, GhlUser> = {};
    for (const u of users) out[u.id] = u;
    return out;
  });
}
