import type { TokenScopes } from "@/lib/apiScopes";

/** Serialized ApiTokenRecord as returned by /api/admin/api-tokens. */
export interface ApiTokenPublic {
  id: string;
  name: string;
  prefix: string;
  scopes: TokenScopes;
  clientIds: string[] | null;
  closerIds: string[] | null;
  /** Workspace (book) restriction — null = all workspaces. */
  workspaces: string[] | null;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  requestCount: number;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceOption {
  id: string;
  name: string;
  role?: string;
}

export interface WorkspaceOption {
  value: string;
  label: string;
}
