import { getAgencyConfig, updateAgencyConfig } from "./agencyConfig";
import type { AdminRecord } from "./admins";

// ---------------------------------------------------------------------------
// Workspaces — separate Client Directory / Team "books" for outside teams.
//
// Every client (users.workspace) and purchased ad account
// (ad_accounts.workspace) belongs to exactly one workspace. Admins carry an
// allow-list (admins.workspaces, JSON string array; NULL/empty = the default
// ["main"]) — the "scope" — of the workspaces they may see. Super admins and
// admins with the `admin` permission are unscoped (scope = null → see all).
//
// Scoping is enforced IN-ROUTE (Node runtime, DB-fresh admin row), never in
// middleware: the directory list/build filters rows by scope, per-client
// routes 404 out-of-scope ids, and the Team hub filters members + clients by
// the viewer's scope. The Payout DB stays internal: any actor whose scope
// does not include "main" (an "external" scope) is cut off from the payout
// pool / payout-derived pickers — their billing still reconciles through the
// same brand match, they just never see the raw ledger.
//
// The registry of extra workspaces lives in agency_config (key
// `workspace_registry`, JSON [{value,label}]) — "main" is a built-in and
// never stored, mirroring the roster-options built-ins pattern.
// ---------------------------------------------------------------------------

export const DEFAULT_WORKSPACE = "main";
export const DEFAULT_WORKSPACE_LABEL = "Agency Collective";

const WORKSPACE_REGISTRY_KEY = "workspace_registry";
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const MAX_LABEL_LEN = 60;
const MAX_WORKSPACES = 50;

export interface WorkspaceOption {
  value: string;
  label: string;
}

/** Scope = allowed workspace slugs; null = unscoped (sees every workspace). */
export type WorkspaceScope = string[] | null;

// ---------------------------------------------------------------------------
// Pure helpers (no DB) — safe to import from client components.
// ---------------------------------------------------------------------------

export function slugifyWorkspace(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Parse the admins.workspaces JSON column. NULL/empty/malformed → null (legacy default). */
export function parseWorkspaceList(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const list = [...new Set(parsed.map((v) => String(v).trim()).filter(Boolean))];
    return list.length > 0 ? list : null;
  } catch {
    return null;
  }
}

export function serializeWorkspaceList(list: string[] | null): string | null {
  if (!list || list.length === 0) return null;
  return JSON.stringify([...new Set(list.map((v) => v.trim()).filter(Boolean))]);
}

/**
 * The workspace scope of an admin. Unscoped (null) for super admins and
 * Admin Management — they always see every book. Everyone else defaults to
 * the main book (existing admins have a NULL column → ["main"], so the
 * current setup is unchanged until someone is explicitly assigned).
 */
export function workspaceScopeOf(admin: AdminRecord): WorkspaceScope {
  if (admin.isSuper || admin.permissions.admin) return null;
  return admin.workspaces ?? [DEFAULT_WORKSPACE];
}

/** May a scope see rows in `workspace`? (null scope = yes, always) */
export function inWorkspaceScope(scope: WorkspaceScope, workspace: string): boolean {
  if (scope === null) return true;
  return scope.includes(workspace || DEFAULT_WORKSPACE);
}

/**
 * Which books an admin BELONGS to — always the explicit list (default
 * ['main']), never null. Distinct from workspaceScopeOf on purpose:
 * privilege (super / Admin Management) grants VISIBILITY into every book,
 * not MEMBERSHIP of every book. Team pages, assignment pickers and member
 * filters must use membership — otherwise every privileged internal admin
 * (COO, account managers with the admin perm) shows up inside a partner
 * book's Team page and pickers.
 */
export function workspaceMembershipOf(admin: AdminRecord): string[] {
  return admin.workspaces ?? [DEFAULT_WORKSPACE];
}

/**
 * External scope = no access to the main book (outside team / partner).
 * External actors are cut off from internal-only surfaces: the Payout DB
 * pool/pickers, the Welcome Kit builder, SOPs, and the payout ledger drill.
 */
export function isExternalScope(scope: WorkspaceScope): boolean {
  return scope !== null && !scope.includes(DEFAULT_WORKSPACE);
}

/** Do two admins share at least one workspace? (either unscoped → yes) */
export function scopesOverlap(a: WorkspaceScope, b: WorkspaceScope): boolean {
  if (a === null || b === null) return true;
  return a.some((w) => b.includes(w));
}

// ---------------------------------------------------------------------------
// Registry (agency_config-backed)
// ---------------------------------------------------------------------------

function parseRegistry(raw: string | null): WorkspaceOption[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e): e is { value: unknown; label: unknown } => !!e && typeof e === "object")
      .map((e) => ({
        value: String(e.value ?? "").trim(),
        label: String(e.label ?? "").trim().slice(0, MAX_LABEL_LEN),
      }))
      .filter((e) => SLUG_RE.test(e.value) && e.value !== DEFAULT_WORKSPACE && e.label);
  } catch {
    return [];
  }
}

/** All workspaces: the built-in main book first, then registry extras. */
export async function listWorkspaces(): Promise<WorkspaceOption[]> {
  let extras: WorkspaceOption[] = [];
  try {
    extras = parseRegistry(await getAgencyConfig(WORKSPACE_REGISTRY_KEY));
  } catch {
    // Config table unavailable (fresh DB mid-migration) — degrade to built-in.
  }
  return [{ value: DEFAULT_WORKSPACE, label: DEFAULT_WORKSPACE_LABEL }, ...extras];
}

/** Registry slugs + main — the valid values for users.workspace. */
export async function listWorkspaceValues(): Promise<Set<string>> {
  const all = await listWorkspaces();
  return new Set(all.map((w) => w.value));
}

export class WorkspaceRegistryError extends Error {}

/** Add a workspace. Returns the created option. */
export async function addWorkspace(label: string): Promise<WorkspaceOption> {
  const trimmed = label.trim().slice(0, MAX_LABEL_LEN);
  if (!trimmed) throw new WorkspaceRegistryError("Label is required");
  const value = slugifyWorkspace(trimmed);
  if (!SLUG_RE.test(value) || value === DEFAULT_WORKSPACE) {
    throw new WorkspaceRegistryError("Invalid workspace name");
  }
  const extras = parseRegistry(await getAgencyConfig(WORKSPACE_REGISTRY_KEY));
  if (extras.length >= MAX_WORKSPACES) {
    throw new WorkspaceRegistryError("Too many workspaces");
  }
  if (
    extras.some((e) => e.value === value || e.label.toLowerCase() === trimmed.toLowerCase()) ||
    trimmed.toLowerCase() === DEFAULT_WORKSPACE_LABEL.toLowerCase()
  ) {
    throw new WorkspaceRegistryError("A workspace with that name already exists");
  }
  const next = [...extras, { value, label: trimmed }];
  await updateAgencyConfig(WORKSPACE_REGISTRY_KEY, JSON.stringify(next));
  return { value, label: trimmed };
}

/** Rename keeps the slug — assigned clients/admins are untouched. */
export async function renameWorkspace(value: string, label: string): Promise<void> {
  const trimmed = label.trim().slice(0, MAX_LABEL_LEN);
  if (!trimmed) throw new WorkspaceRegistryError("Label is required");
  const extras = parseRegistry(await getAgencyConfig(WORKSPACE_REGISTRY_KEY));
  const target = extras.find((e) => e.value === value);
  if (!target) throw new WorkspaceRegistryError("Workspace not found");
  if (
    extras.some(
      (e) => e.value !== value && e.label.toLowerCase() === trimmed.toLowerCase()
    )
  ) {
    throw new WorkspaceRegistryError("A workspace with that name already exists");
  }
  target.label = trimmed;
  await updateAgencyConfig(WORKSPACE_REGISTRY_KEY, JSON.stringify(extras));
}

/**
 * Remove a workspace from the registry. Rows keeping the slug still render
 * (label falls back to the slug) — nothing is deleted or reassigned; callers
 * should move clients out first.
 */
export async function removeWorkspace(value: string): Promise<void> {
  const extras = parseRegistry(await getAgencyConfig(WORKSPACE_REGISTRY_KEY));
  const next = extras.filter((e) => e.value !== value);
  if (next.length === extras.length) throw new WorkspaceRegistryError("Workspace not found");
  await updateAgencyConfig(WORKSPACE_REGISTRY_KEY, JSON.stringify(next));
}
