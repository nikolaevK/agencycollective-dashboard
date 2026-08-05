import { describe, it, expect } from "vitest";
import {
  parseWorkspaceList,
  serializeWorkspaceList,
  workspaceScopeOf,
  workspaceMembershipOf,
  inWorkspaceScope,
  isExternalScope,
  scopesOverlap,
  slugifyWorkspace,
  DEFAULT_WORKSPACE,
} from "@/lib/workspaces";
import { tokenWorkspaceScope, tokenIsExternal } from "@/lib/apiScopes";
import type { AdminRecord } from "@/lib/admins";
import { allPermissionsFalse, allPermissionsTrue } from "@/lib/permissions";

function admin(overrides: Partial<AdminRecord>): AdminRecord {
  return {
    id: "a1",
    username: "a1",
    passwordHash: null,
    isSuper: false,
    displayName: null,
    email: null,
    avatarPath: null,
    role: "admin",
    permissions: allPermissionsFalse(),
    workspaces: null,
    ...overrides,
  };
}

describe("parseWorkspaceList / serializeWorkspaceList", () => {
  it("NULL/empty/malformed all read as the legacy default (null)", () => {
    expect(parseWorkspaceList(null)).toBeNull();
    expect(parseWorkspaceList("")).toBeNull();
    expect(parseWorkspaceList("[]")).toBeNull();
    expect(parseWorkspaceList("not json")).toBeNull();
    expect(parseWorkspaceList('{"a":1}')).toBeNull();
  });

  it("round-trips, trims and dedupes", () => {
    expect(parseWorkspaceList('["teamx","teamx"," main "]')).toEqual(["teamx", "main"]);
    expect(serializeWorkspaceList(["teamx", "teamx"])).toBe('["teamx"]');
    expect(serializeWorkspaceList([])).toBeNull();
    expect(serializeWorkspaceList(null)).toBeNull();
  });
});

describe("workspaceScopeOf (visibility) vs workspaceMembershipOf (belonging)", () => {
  it("privilege grants visibility (null scope), never membership", () => {
    const superAdmin = admin({ isSuper: true, permissions: allPermissionsTrue() });
    expect(workspaceScopeOf(superAdmin)).toBeNull();
    expect(workspaceMembershipOf(superAdmin)).toEqual([DEFAULT_WORKSPACE]);

    const adminPerm = admin({
      permissions: { ...allPermissionsFalse(), admin: true },
    });
    expect(workspaceScopeOf(adminPerm)).toBeNull();
    expect(workspaceMembershipOf(adminPerm)).toEqual([DEFAULT_WORKSPACE]);
  });

  it("non-privileged admins default to the main book (existing setup unchanged)", () => {
    const legacy = admin({});
    expect(workspaceScopeOf(legacy)).toEqual([DEFAULT_WORKSPACE]);
    expect(workspaceMembershipOf(legacy)).toEqual([DEFAULT_WORKSPACE]);
  });

  it("explicit assignment drives both, incl. for privileged membership", () => {
    const partner = admin({ workspaces: ["teamx"] });
    expect(workspaceScopeOf(partner)).toEqual(["teamx"]);
    expect(workspaceMembershipOf(partner)).toEqual(["teamx"]);

    const privilegedBothBooks = admin({
      isSuper: true,
      workspaces: ["main", "teamx"],
    });
    expect(workspaceScopeOf(privilegedBothBooks)).toBeNull(); // still sees all
    expect(workspaceMembershipOf(privilegedBothBooks)).toEqual(["main", "teamx"]);
  });
});

describe("inWorkspaceScope / isExternalScope / scopesOverlap", () => {
  it("null scope sees everything; lists are strict", () => {
    expect(inWorkspaceScope(null, "teamx")).toBe(true);
    expect(inWorkspaceScope(["main"], "teamx")).toBe(false);
    expect(inWorkspaceScope(["teamx"], "teamx")).toBe(true);
    // Empty/legacy workspace values coerce to main.
    expect(inWorkspaceScope(["main"], "")).toBe(true);
  });

  it("external = scope without the main book", () => {
    expect(isExternalScope(null)).toBe(false);
    expect(isExternalScope(["main"])).toBe(false);
    expect(isExternalScope(["main", "teamx"])).toBe(false);
    expect(isExternalScope(["teamx"])).toBe(true);
  });

  it("scopesOverlap: null on either side always overlaps", () => {
    expect(scopesOverlap(null, ["teamx"])).toBe(true);
    expect(scopesOverlap(["teamx"], null)).toBe(true);
    expect(scopesOverlap(["main"], ["teamx"])).toBe(false);
    expect(scopesOverlap(["main", "teamx"], ["teamx"])).toBe(true);
  });
});

describe("slugifyWorkspace", () => {
  it("produces stable, url-safe slugs", () => {
    expect(slugifyWorkspace("Team North!")).toBe("team-north");
    // Non-ASCII letters are separators, not letters — surviving ASCII runs join.
    expect(slugifyWorkspace("  Ünïcode  Book  ")).toBe("n-code-book");
    expect(slugifyWorkspace("PepAds 2")).toBe("pepads-2");
  });
});

describe("API token workspace restriction helpers", () => {
  const base = { scopes: {}, clientIds: null, closerIds: null };

  it("null/empty restriction = all workspaces (existing tokens unchanged)", () => {
    expect(tokenWorkspaceScope({ ...base })).toBeNull();
    expect(tokenWorkspaceScope({ ...base, workspaces: null })).toBeNull();
    expect(tokenWorkspaceScope({ ...base, workspaces: [] })).toBeNull();
    expect(tokenIsExternal({ ...base })).toBe(false);
  });

  it("restricted tokens mirror the admin external rule", () => {
    expect(tokenWorkspaceScope({ ...base, workspaces: ["teamx"] })).toEqual(["teamx"]);
    expect(tokenIsExternal({ ...base, workspaces: ["teamx"] })).toBe(true);
    expect(tokenIsExternal({ ...base, workspaces: ["main", "teamx"] })).toBe(false);
  });
});
