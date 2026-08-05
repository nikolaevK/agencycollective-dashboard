"use client";

import { useQuery } from "@tanstack/react-query";

export interface WorkspaceOption {
  value: string;
  label: string;
}

interface WorkspacesResponse {
  workspaces: WorkspaceOption[];
  canManage: boolean;
}

/**
 * Workspace (book) options visible to the acting admin — scoped server-side
 * (`/api/admin/clients/workspaces`). Feeds the Add/Edit client modals, the
 * directory workspace filter, and the ad-account create flow.
 */
export function useWorkspaces() {
  const { data } = useQuery<WorkspacesResponse>({
    queryKey: ["workspace-options"],
    queryFn: async () => {
      const res = await fetch("/api/admin/clients/workspaces");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return {
        workspaces: Array.isArray(json.data?.workspaces) ? json.data.workspaces : [],
        canManage: Boolean(json.data?.canManage),
      };
    },
    staleTime: 300_000,
  });
  return {
    workspaces: data?.workspaces ?? [],
    canManage: data?.canManage ?? false,
  };
}
