"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ClientProfile, ClientTeamMember, TeamRole } from "@/lib/clientProfile";
import type { ClientPublic } from "@/components/users/types";

export type ClientProfilePatch = Partial<
  Omit<ClientProfile, "userId" | "createdAt" | "updatedAt">
>;

const MUTATION_KEY = ["client-roster"];

// ---------------------------------------------------------------------------
// Per-client write queue. Rapid chip toggles each send the FULL field array —
// if two PATCHes fly concurrently the network can deliver them out of order
// and the older payload wins on the server (a pill "randomly" disappears on
// the next refetch). Serializing requests per client guarantees the last
// click is also the last write. Module-level so it survives re-renders.
// ---------------------------------------------------------------------------

const writeQueues = new Map<string, Promise<unknown>>();

function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
  const prev = writeQueues.get(key) ?? Promise.resolve();
  const run = prev.then(task, task); // run regardless of the prior outcome
  const tail = run.catch(() => {}); // keep the chain alive after a failure
  writeQueues.set(key, tail);
  // Prune the entry once the chain drains (no newer write queued behind it)
  // so the map doesn't accumulate one resolved promise per client forever.
  tail.finally(() => {
    if (writeQueues.get(key) === tail) writeQueues.delete(key);
  });
  return run;
}

async function patchProfileRequest(userId: string, changes: ClientProfilePatch) {
  const res = await fetch(`/api/admin/clients/${userId}/profile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error(json?.error ?? `HTTP ${res.status}`);
  }
  const json = await res.json();
  return json.data.profile as ClientProfile;
}

async function putTeamRequest(userId: string, role: TeamRole, adminIds: string[]) {
  const res = await fetch(`/api/admin/clients/${userId}/team`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, adminIds }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error(json?.error ?? `HTTP ${res.status}`);
  }
  const json = await res.json();
  return json.data.team as ClientTeamMember[];
}

/**
 * Inline roster edit mutations. Optimistically patch the cached
 * ["admin-users"] rows (chips respond instantly), roll back + alert on error.
 * Hardened against rapid-edit races:
 *  - requests are serialized per client (see writeQueues),
 *  - only the LAST settling roster mutation triggers the refetch, so an
 *    earlier mutation's refetch can't overwrite a newer optimistic update.
 */
export function useClientProfileMutations() {
  const queryClient = useQueryClient();

  // The current mutation is still counted while onSettled runs, so "1" means
  // "I'm the only roster write left in flight".
  const isLastRosterWrite = () =>
    queryClient.isMutating({ mutationKey: MUTATION_KEY }) === 1;

  const patchProfile = useMutation({
    mutationKey: MUTATION_KEY,
    mutationFn: ({ userId, changes }: { userId: string; changes: ClientProfilePatch }) =>
      enqueue(userId, () => patchProfileRequest(userId, changes)),
    onMutate: async ({ userId, changes }) => {
      await queryClient.cancelQueries({ queryKey: ["admin-users"] });
      const prev = queryClient.getQueryData<ClientPublic[]>(["admin-users"]);
      if (prev) {
        queryClient.setQueryData<ClientPublic[]>(
          ["admin-users"],
          prev.map((c) =>
            c.id === userId ? { ...c, profile: { ...c.profile, ...changes } } : c
          )
        );
      }
      return { prev };
    },
    // Hook-level (always fires — per-call callbacks are skipped when the row
    // unmounted mid-flight): roll back the optimistic chips AND surface it.
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["admin-users"], ctx.prev);
      console.error("[client-profile] save failed:", err);
      alert(`Save failed: ${err instanceof Error ? err.message : "unknown error"}`);
    },
    onSettled: (_data, _err, vars) => {
      // rebill-alerts has no optimistic state — always safe to refresh.
      if (vars.changes.book !== undefined) {
        queryClient.invalidateQueries({ queryKey: ["admin-rebill-alerts"] });
      }
      if (isLastRosterWrite()) {
        queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      }
    },
  });

  const putTeam = useMutation({
    mutationKey: MUTATION_KEY,
    mutationFn: ({
      userId,
      role,
      members,
    }: {
      userId: string;
      role: TeamRole;
      /** Full desired member list for this role (replace-set). */
      members: ClientTeamMember[];
    }) =>
      enqueue(userId, () =>
        putTeamRequest(
          userId,
          role,
          members.map((m) => m.adminId)
        )
      ),
    onMutate: async ({ userId, role, members }) => {
      await queryClient.cancelQueries({ queryKey: ["admin-users"] });
      const prev = queryClient.getQueryData<ClientPublic[]>(["admin-users"]);
      if (prev) {
        queryClient.setQueryData<ClientPublic[]>(
          ["admin-users"],
          prev.map((c) =>
            c.id === userId
              ? { ...c, team: [...c.team.filter((m) => m.role !== role), ...members] }
              : c
          )
        );
      }
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["admin-users"], ctx.prev);
      console.error("[client-team] save failed:", err);
      alert(`Save failed: ${err instanceof Error ? err.message : "unknown error"}`);
    },
    onSettled: () => {
      if (isLastRosterWrite()) {
        queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      }
    },
  });

  return { patchProfile, putTeam };
}
