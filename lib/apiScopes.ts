/**
 * Scope model for the external API (`/api/v1/*` + `/api/mcp`).
 *
 * Mirrors lib/permissions.ts in spirit, but tokens are NOT role-based: a
 * token grants per-resource access at read | write | delete granularity
 * (ordinal — delete implies write implies read). Resource keys map 1:1 to
 * admin dashboard modules: closer → Closers page, client → Client Directory,
 * media → Media Buyers, sops → SOPs, metaaccounts → Meta Accounts Directory
 * (credential columns are write-only over the API — redacted from every read).
 *
 * Scopes are stored as a JSON TEXT column on `api_tokens` and evaluated in
 * Node after the row loads by hash — adding a resource or level never needs
 * a migration.
 */

export const RESOURCE_KEYS = ["closer", "client", "media", "sops", "audit", "metaaccounts"] as const;
export type ResourceKey = (typeof RESOURCE_KEYS)[number];

export const ACCESS_LEVELS = ["none", "read", "write", "delete"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export type ScopeAction = "read" | "write" | "delete";

/** JSON shape stored in api_tokens.scopes, e.g. {closer:"write",sops:"read"}. */
export type TokenScopes = Partial<Record<ResourceKey, AccessLevel>>;

/** Required-scope string carried by each operation, e.g. "media:delete". */
export type ScopeKey = `${ResourceKey}:${ScopeAction}`;

const LEVEL_RANK: Record<AccessLevel, number> = {
  none: 0,
  read: 1,
  write: 2,
  delete: 3,
};

/** PERMISSION_MODULES-style metadata driving the scope selector + docs. */
export const SCOPE_MODULES: {
  key: ResourceKey;
  label: string;
  description: string;
  icon: string;
  auditPrefix: string;
  /** Highest grantable level (read-only resources); unset = delete. */
  maxLevel?: AccessLevel;
}[] = [
  {
    key: "closer",
    label: "Closers",
    description: "Sales pipeline: closers, deals, payouts, attendance",
    icon: "Handshake",
    auditPrefix: "closer",
  },
  {
    key: "client",
    label: "Client Directory",
    description: "Clients, billing, ad accounts, welcome kit",
    icon: "Users",
    auditPrefix: "client",
  },
  {
    key: "media",
    label: "Media Buyers",
    description: "Media documents, folders, reads, activity",
    icon: "Megaphone",
    auditPrefix: "media",
  },
  {
    key: "sops",
    label: "SOPs",
    description: "Standard operating procedures and folders",
    icon: "BookOpen",
    auditPrefix: "sop",
  },
  {
    key: "audit",
    label: "Audit Log",
    description: "Read-only trail of admin + API actions",
    icon: "ScrollText",
    auditPrefix: "audit",
    maxLevel: "read",
  },
  {
    key: "metaaccounts",
    label: "Meta Accounts",
    description: "FB account inventory & warm-up (credentials write-only — never returned)",
    icon: "Boxes",
    auditPrefix: "meta_account",
  },
];

/** The subset of a token the scope helpers need (full record satisfies it). */
export interface ScopedTokenLike {
  scopes: TokenScopes;
  /** null or [] = all clients allowed. */
  clientIds: string[] | null;
  /** null or [] = all closers allowed. */
  closerIds: string[] | null;
}

export function tokenHasScope(token: ScopedTokenLike, scope: ScopeKey): boolean {
  const [resource, action] = scope.split(":") as [ResourceKey, ScopeAction];
  const granted = token.scopes[resource] ?? "none";
  return LEVEL_RANK[granted] >= LEVEL_RANK[action];
}

/**
 * Resource-level scoping: is this token allowed to touch the given client /
 * closer id? An unset or empty list means "all". A restricted token is
 * denied on ownerless resources (id null) — e.g. unassigned ad accounts —
 * so the restriction can't be skipped via orphan rows.
 */
export function tokenHasResource(
  token: ScopedTokenLike,
  kind: "client" | "closer",
  id: string | null
): boolean {
  const list = kind === "client" ? token.clientIds : token.closerIds;
  if (!list || list.length === 0) return true;
  return id !== null && list.includes(id);
}

/**
 * The allow-list for a resource kind, or null when the token may see all.
 * Used to filter list results BEFORE pagination so counts stay correct.
 */
export function allowedResourceIds(
  token: ScopedTokenLike,
  kind: "client" | "closer"
): string[] | null {
  const list = kind === "client" ? token.clientIds : token.closerIds;
  if (!list || list.length === 0) return null;
  return list;
}

/**
 * Whitelist arbitrary input down to a valid TokenScopes object — the token
 * equivalent of the admins route's sanitizePermissions. Unknown resources and
 * invalid levels are dropped; "none" entries are omitted entirely; levels
 * above a module's `maxLevel` (read-only resources like `audit`) are clamped
 * so the cap holds server-side, not just in the selector UI.
 */
export function sanitizeScopes(raw: unknown): TokenScopes {
  const out: TokenScopes = {};
  if (!raw || typeof raw !== "object") return out;
  for (const key of RESOURCE_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (
      typeof value === "string" &&
      (ACCESS_LEVELS as readonly string[]).includes(value) &&
      value !== "none"
    ) {
      let level = value as AccessLevel;
      const maxLevel = SCOPE_MODULES.find((m) => m.key === key)?.maxLevel;
      if (maxLevel && LEVEL_RANK[level] > LEVEL_RANK[maxLevel]) level = maxLevel;
      out[key] = level;
    }
  }
  return out;
}

/** Sanitize a client_ids / closer_ids input: string array or null (= all). */
export function sanitizeResourceIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const ids = raw
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : null;
}
