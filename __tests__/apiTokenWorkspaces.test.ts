import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { parseTokenWorkspaces } from "@/app/api/admin/api-tokens/workspaceInput";
import { workspacesToSend } from "@/components/api-tokens/workspaceSelection";

// A token's workspace (book) restriction must never silently widen to "all
// books": not on an unrelated edit, not when its book is deleted, not when a
// requested list names only unknown books. Routes run with the session, the
// admin record, the token store and the registry mocked.

type Token = {
  id: string;
  name: string;
  workspaces: string[] | null;
  revokedAt: string | null;
  expiresAt: string | null;
};

let registry = new Set(["main", "partner"]);
let tokens: Token[] = [];
const updateApiToken = vi.fn();
const createApiToken = vi.fn();
const removeWorkspace = vi.fn();

vi.mock("@/lib/adminSession", () => ({ getAdminSession: () => ({ adminId: "a1" }) }));
vi.mock("@/lib/admins", () => ({
  findAdmin: async () => ({
    id: "a1",
    username: "root",
    displayName: null,
    isSuper: true,
    permissions: {},
    workspaces: null,
  }),
  readAdmins: async () => [],
}));
vi.mock("@/lib/auditLog", () => ({ logAuditEvent: async () => {} }));
vi.mock("@/lib/db", () => ({ ensureMigrated: async () => {} }));
vi.mock("@/lib/users", () => ({ readUsers: async () => [] }));
vi.mock("@/lib/apiTokens", () => ({
  findApiToken: async (id: string) => tokens.find((t) => t.id === id) ?? null,
  listApiTokens: async () => tokens,
  updateApiToken: (...a: unknown[]) => updateApiToken(...a),
  createApiToken: (...a: unknown[]) => createApiToken(...a),
  revokeApiToken: async () => true,
  deleteApiToken: async () => true,
}));
vi.mock("@/lib/workspaces", () => {
  class WorkspaceRegistryError extends Error {}
  return {
    DEFAULT_WORKSPACE: "main",
    WorkspaceRegistryError,
    listWorkspaceValues: async () => new Set(registry),
    listWorkspaces: async () => [...registry].map((value) => ({ value, label: value })),
    addWorkspace: async () => ({ value: "x", label: "x" }),
    renameWorkspace: async () => {},
    removeWorkspace: (...a: unknown[]) => removeWorkspace(...a),
  };
});

type Handler = (req: Request, ctx: { params: { id: string } }) => Promise<Response>;
let patchToken: Handler;
let postToken: (req: Request) => Promise<Response>;
let deleteWorkspace: (req: Request) => Promise<Response>;

beforeAll(async () => {
  ({ PATCH: patchToken } = await import("@/app/api/admin/api-tokens/[id]/route"));
  ({ POST: postToken } = await import("@/app/api/admin/api-tokens/route"));
  ({ DELETE: deleteWorkspace } = await import("@/app/api/admin/admins/workspaces/route"));
});

beforeEach(() => {
  registry = new Set(["main", "partner"]);
  tokens = [
    { id: "t1", name: "agent", workspaces: ["partner"], revokedAt: null, expiresAt: null },
  ];
  updateApiToken.mockReset().mockImplementation(async (id: string, changes: Partial<Token>) => ({
    ...tokens.find((t) => t.id === id),
    ...changes,
  }));
  createApiToken.mockReset().mockImplementation(async (input: Record<string, unknown>) => ({
    record: { id: "new", prefix: "ac_live_00000000", ...input },
    token: "ac_live_secret",
  }));
  removeWorkspace.mockReset().mockResolvedValue(undefined);
});

function json(method: string, body: unknown, url = "http://localhost/api/admin/api-tokens"): Request {
  return new Request(url, {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const patch = (body: unknown) =>
  patchToken(json("PATCH", body, "http://localhost/api/admin/api-tokens/t1"), { params: { id: "t1" } });

describe("parseTokenWorkspaces", () => {
  const valid = new Set(["main", "partner"]);
  it("explicit null / [] mean all workspaces", () => {
    expect(parseTokenWorkspaces(null, valid)).toEqual({ ok: true, workspaces: null });
    expect(parseTokenWorkspaces([], valid)).toEqual({ ok: true, workspaces: null });
  });
  it("keeps known slugs (trimmed, de-duped) and drops unknown ones", () => {
    expect(parseTokenWorkspaces([" partner", "gone", "partner"], valid)).toEqual({
      ok: true,
      workspaces: ["partner"],
    });
  });
  it("a non-empty list with no known slug is an error, never null", () => {
    expect(parseTokenWorkspaces(["gone"], valid).ok).toBe(false);
    expect(parseTokenWorkspaces([""], valid).ok).toBe(false);
  });
  it("rejects non-array input", () => {
    expect(parseTokenWorkspaces("partner", valid).ok).toBe(false);
    expect(parseTokenWorkspaces({ 0: "partner" }, valid).ok).toBe(false);
  });
});

describe("workspacesToSend (token form)", () => {
  it("create: the selection, or null for all workspaces", () => {
    expect(workspacesToSend(["partner"], null)).toEqual(["partner"]);
    expect(workspacesToSend([], null)).toBeNull();
  });
  it("edit: omitted while the selection is unchanged (order-insensitive)", () => {
    expect(workspacesToSend(["gone"], { workspaces: ["gone"] })).toBeUndefined();
    expect(workspacesToSend(["b", "a"], { workspaces: ["a", "b"] })).toBeUndefined();
    expect(workspacesToSend([], { workspaces: null })).toBeUndefined();
  });
  it("edit: sent when it changed — [] → null clears the restriction explicitly", () => {
    expect(workspacesToSend(["a", "b"], { workspaces: ["a"] })).toEqual(["a", "b"]);
    expect(workspacesToSend([], { workspaces: ["a"] })).toBeNull();
    expect(workspacesToSend(["a"], { workspaces: null })).toEqual(["a"]);
  });
});

describe("PATCH /api/admin/api-tokens/[id]", () => {
  it("the reported repro: book deleted, then a rename leaves the restriction alone", async () => {
    tokens[0].workspaces = ["gone"];
    registry = new Set(["main"]);
    const res = await patch({ name: "renamed" });
    expect(res.status).toBe(200);
    const changes = updateApiToken.mock.calls[0][1];
    expect(changes).toEqual({ name: "renamed" });
    expect("workspaces" in changes).toBe(false);
  });

  it("a list naming only deleted books → 400, nothing written (not null = all books)", async () => {
    registry = new Set(["main"]);
    const res = await patch({ name: "renamed", workspaces: ["partner"] });
    expect(res.status).toBe(400);
    expect(updateApiToken).not.toHaveBeenCalled();
  });

  it("non-array workspaces → 400", async () => {
    const res = await patch({ workspaces: "partner" });
    expect(res.status).toBe(400);
    expect(updateApiToken).not.toHaveBeenCalled();
  });

  it("explicit null / [] lift the restriction", async () => {
    expect((await patch({ workspaces: null })).status).toBe(200);
    expect(updateApiToken.mock.calls[0][1]).toEqual({ workspaces: null });
    expect((await patch({ workspaces: [] })).status).toBe(200);
    expect(updateApiToken.mock.calls[1][1]).toEqual({ workspaces: null });
  });

  it("unknown slugs are dropped from an otherwise valid list (narrower, never wider)", async () => {
    expect((await patch({ workspaces: ["gone", "partner"] })).status).toBe(200);
    expect(updateApiToken.mock.calls[0][1]).toEqual({ workspaces: ["partner"] });
  });
});

describe("POST /api/admin/api-tokens", () => {
  const base = { name: "agent", scopes: { client: "read" } };

  it("a list naming no existing book → 400, no token minted", async () => {
    const res = await postToken(json("POST", { ...base, workspaces: ["gone"] }));
    expect(res.status).toBe(400);
    expect(createApiToken).not.toHaveBeenCalled();
  });

  it("non-array workspaces → 400 (used to mint an all-books token)", async () => {
    const res = await postToken(json("POST", { ...base, workspaces: "partner" }));
    expect(res.status).toBe(400);
    expect(createApiToken).not.toHaveBeenCalled();
  });

  it("omitted / null → all books; a valid list is kept", async () => {
    expect((await postToken(json("POST", base))).status).toBe(201);
    expect(createApiToken.mock.calls[0][0].workspaces).toBeNull();
    expect((await postToken(json("POST", { ...base, workspaces: null }))).status).toBe(201);
    expect(createApiToken.mock.calls[1][0].workspaces).toBeNull();
    expect((await postToken(json("POST", { ...base, workspaces: ["partner"] }))).status).toBe(201);
    expect(createApiToken.mock.calls[2][0].workspaces).toEqual(["partner"]);
  });
});

describe("DELETE /api/admin/admins/workspaces", () => {
  const del = () =>
    deleteWorkspace(
      new Request("http://localhost/api/admin/admins/workspaces?value=partner", { method: "DELETE" })
    );

  it("409 while a live token is restricted to the book", async () => {
    const res = await del();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/API token/);
    expect(removeWorkspace).not.toHaveBeenCalled();
  });

  it("an expired (not revoked) token still blocks — its expiry can be extended", async () => {
    tokens[0].expiresAt = "2020-01-01";
    expect((await del()).status).toBe(409);
    expect(removeWorkspace).not.toHaveBeenCalled();
  });

  it("revoked tokens and tokens restricted elsewhere don't block", async () => {
    tokens = [
      { id: "t1", name: "old", workspaces: ["partner"], revokedAt: "2026-01-01", expiresAt: null },
      { id: "t2", name: "main-only", workspaces: ["main"], revokedAt: null, expiresAt: null },
      { id: "t3", name: "all", workspaces: null, revokedAt: null, expiresAt: null },
    ];
    expect((await del()).status).toBe(200);
    expect(removeWorkspace).toHaveBeenCalledWith("partner");
  });
});
