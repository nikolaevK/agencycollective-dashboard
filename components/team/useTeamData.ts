"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  TeamDirectoryPayload,
  MemberHubPayload,
  TeamTaskRecord,
  TeamActionItemRecord,
  TaskStatus,
  TeamTimeframeValue,
} from "./types";

// ---------------------------------------------------------------------------
// Team hub data layer — React Query wrappers over /api/admin/team/*.
// Task/item mutations follow the MetaAccountsDirectory pattern: optimistic
// setQueryData from the PATCH response + client-side recompute, invalidate on
// error (refetch = rollback to server truth).
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json.data as T;
}

async function mutateJson<T>(
  url: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json.data as T;
}

export function useTeamDirectory(timeframe: TeamTimeframeValue) {
  return useQuery<TeamDirectoryPayload>({
    queryKey: ["team-directory", timeframe],
    queryFn: () => fetchJson(`/api/admin/team?timeframe=${timeframe}`),
    staleTime: 60_000,
  });
}

export function useMemberHub(adminId: string, timeframe: TeamTimeframeValue) {
  return useQuery<MemberHubPayload>({
    queryKey: ["team-member", adminId, timeframe],
    queryFn: () =>
      fetchJson(`/api/admin/team/members/${adminId}?timeframe=${timeframe}`),
    staleTime: 60_000,
    retry: false,
  });
}

export function useMemberTasks(adminId: string) {
  return useQuery<TeamTaskRecord[]>({
    queryKey: ["team-tasks", adminId],
    queryFn: async () => {
      const data = await fetchJson<{ tasks: TeamTaskRecord[] }>(
        `/api/admin/team/members/${adminId}/tasks`
      );
      return data.tasks;
    },
    staleTime: 30_000,
  });
}

export interface TeamMemberOption {
  adminId: string;
  name: string;
  position: string;
  attribution: string;
}

/** Slim roster list for assignee/forward pickers (any admin may fetch). */
export function useTeamMemberOptions() {
  return useQuery<TeamMemberOption[]>({
    queryKey: ["team-member-options"],
    queryFn: async () => {
      const data = await fetchJson<{ members: TeamMemberOption[] }>(
        "/api/admin/team/members"
      );
      return data.members;
    },
    staleTime: 300_000,
  });
}

export function useMemberActionItems(adminId: string) {
  return useQuery<TeamActionItemRecord[]>({
    queryKey: ["team-action-items", adminId],
    queryFn: async () => {
      const data = await fetchJson<{ items: TeamActionItemRecord[] }>(
        `/api/admin/team/members/${adminId}/action-items`
      );
      return data.items;
    },
    staleTime: 30_000,
  });
}

/** Sort helper shared by list + board renders (server lane order). */
export function sortTasks(tasks: TeamTaskRecord[]): TeamTaskRecord[] {
  return [...tasks].sort(
    (a, b) => a.sortPos - b.sortPos || a.createdAt.localeCompare(b.createdAt)
  );
}

export interface TaskMutations {
  createTask: (input: Record<string, unknown>) => Promise<TeamTaskRecord>;
  patchTask: (id: string, changes: Record<string, unknown>) => Promise<void>;
  moveTask: (
    id: string,
    move: { status: TaskStatus; afterTaskId: string | null },
    optimistic?: TeamTaskRecord[]
  ) => Promise<void>;
  /** Full ownership transfer to another hub (linked action item moves too). */
  reassignTask: (id: string, toAdminId: string) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
}

export function useTaskMutations(adminId: string): TaskMutations {
  const queryClient = useQueryClient();
  const key = ["team-tasks", adminId];

  const setTasks = (fn: (prev: TeamTaskRecord[]) => TeamTaskRecord[]) =>
    queryClient.setQueryData<TeamTaskRecord[]>(key, (prev) => fn(prev ?? []));

  // A task status flip may solve/reopen its linked action item server-side —
  // refresh the inbox + rollups lazily rather than tracking the link here.
  const invalidateLinked = () => {
    queryClient.invalidateQueries({ queryKey: ["team-action-items", adminId] });
    queryClient.invalidateQueries({ queryKey: ["team-member", adminId] });
    queryClient.invalidateQueries({ queryKey: ["team-directory"] });
  };
  const rollback = () => {
    queryClient.invalidateQueries({ queryKey: key });
    invalidateLinked();
  };

  return {
    async createTask(input) {
      const task = await mutateJson<TeamTaskRecord>(
        `/api/admin/team/members/${adminId}/tasks`,
        "POST",
        input
      );
      setTasks((prev) => [...prev, task]);
      invalidateLinked();
      return task;
    },

    async patchTask(id, changes) {
      // Optimistic field merge; the response then replaces the row wholesale.
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? ({ ...t, ...changes } as TeamTaskRecord) : t))
      );
      try {
        const task = await mutateJson<TeamTaskRecord>(
          `/api/admin/team/tasks/${id}`,
          "PATCH",
          changes
        );
        setTasks((prev) => prev.map((t) => (t.id === id ? task : t)));
        if (changes.status !== undefined) invalidateLinked();
      } catch (err) {
        rollback();
        throw err;
      }
    },

    async moveTask(id, move, optimistic) {
      if (optimistic) queryClient.setQueryData<TeamTaskRecord[]>(key, optimistic);
      try {
        const task = await mutateJson<TeamTaskRecord>(
          `/api/admin/team/tasks/${id}`,
          "PATCH",
          { move }
        );
        setTasks((prev) => prev.map((t) => (t.id === id ? task : t)));
        invalidateLinked();
      } catch (err) {
        rollback();
        throw err;
      }
    },

    async reassignTask(id, toAdminId) {
      // Deliberately NOT optimistic: removing the row up-front unmounts an
      // open TaskDetailSheet mid-request, and a failed PATCH would then
      // remount it reset to server state, discarding unsaved edits. Reassign
      // isn't latency-critical — wait for the server, then drop the row.
      await mutateJson(`/api/admin/team/tasks/${id}`, "PATCH", {
        reassignTo: toAdminId,
      });
      setTasks((prev) => prev.filter((t) => t.id !== id));
      invalidateLinked();
      queryClient.invalidateQueries({ queryKey: ["team-tasks", toAdminId] });
      queryClient.invalidateQueries({ queryKey: ["team-action-items", toAdminId] });
      queryClient.invalidateQueries({ queryKey: ["team-member", toAdminId] });
    },

    async removeTask(id) {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      try {
        await mutateJson(`/api/admin/team/tasks/${id}`, "DELETE");
        invalidateLinked();
      } catch (err) {
        rollback();
        throw err;
      }
    },
  };
}

export function useActionItemMutations(adminId: string) {
  const queryClient = useQueryClient();
  const itemsKey = ["team-action-items", adminId];
  const tasksKey = ["team-tasks", adminId];

  return {
    async setItemStatus(id: string, status: "solved" | "unsolved") {
      // Optimistic: flip the item AND its linked task in both caches.
      const prevItems = queryClient.getQueryData<TeamActionItemRecord[]>(itemsKey);
      const item = prevItems?.find((i) => i.id === id);
      queryClient.setQueryData<TeamActionItemRecord[]>(itemsKey, (prev) =>
        (prev ?? []).map((i) => (i.id === id ? { ...i, status } : i))
      );
      if (item?.taskId) {
        queryClient.setQueryData<TeamTaskRecord[]>(tasksKey, (prev) =>
          (prev ?? []).map((t) =>
            t.id === item.taskId
              ? { ...t, status: status === "solved" ? "complete" : "todo" }
              : t
          )
        );
      }
      try {
        const updated = await mutateJson<TeamActionItemRecord>(
          `/api/admin/team/action-items/${id}`,
          "PATCH",
          { status }
        );
        queryClient.setQueryData<TeamActionItemRecord[]>(itemsKey, (prev) =>
          (prev ?? []).map((i) => (i.id === id ? updated : i))
        );
        queryClient.invalidateQueries({ queryKey: tasksKey });
        queryClient.invalidateQueries({ queryKey: ["team-member", adminId] });
        queryClient.invalidateQueries({ queryKey: ["team-directory"] });
      } catch (err) {
        queryClient.invalidateQueries({ queryKey: itemsKey });
        queryClient.invalidateQueries({ queryKey: tasksKey });
        throw err;
      }
    },

    /**
     * Full ownership transfer to another inbox (linked task moves too).
     * Not optimistic — see reassignTask in useTaskMutations for the rationale.
     */
    async reassignItem(id: string, toAdminId: string) {
      const item = queryClient
        .getQueryData<TeamActionItemRecord[]>(itemsKey)
        ?.find((i) => i.id === id);
      await mutateJson(`/api/admin/team/action-items/${id}`, "PATCH", {
        reassignTo: toAdminId,
      });
      queryClient.setQueryData<TeamActionItemRecord[]>(itemsKey, (prev) =>
        (prev ?? []).filter((i) => i.id !== id)
      );
      if (item?.taskId) {
        queryClient.setQueryData<TeamTaskRecord[]>(tasksKey, (prev) =>
          (prev ?? []).filter((t) => t.id !== item.taskId)
        );
      }
      queryClient.invalidateQueries({ queryKey: ["team-member", adminId] });
      queryClient.invalidateQueries({ queryKey: ["team-tasks", toAdminId] });
      queryClient.invalidateQueries({ queryKey: ["team-action-items", toAdminId] });
      queryClient.invalidateQueries({ queryKey: ["team-member", toAdminId] });
      queryClient.invalidateQueries({ queryKey: ["team-directory"] });
    },
  };
}
