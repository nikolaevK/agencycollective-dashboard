/**
 * Token workspace (book) restriction input, shared by POST /api/admin/api-tokens
 * and PATCH /api/admin/api-tokens/[id]. Pure — the caller passes the registry.
 *
 * Only an EXPLICIT `null` or `[]` means "all books". A non-empty list keeps
 * its registry slugs (unknown ones are dropped — a narrower restriction, never
 * a wider one); a non-empty list with NO known slug is an error, never null:
 * turning "restricted to a deleted book" into "every book" on an unrelated
 * edit was a fail-open.
 */
export type TokenWorkspacesInput =
  | { ok: true; workspaces: string[] | null }
  | { ok: false; error: string };

export function parseTokenWorkspaces(raw: unknown, valid: Set<string>): TokenWorkspacesInput {
  if (raw === null) return { ok: true, workspaces: null };
  if (!Array.isArray(raw)) {
    return { ok: false, error: "workspaces must be an array of workspace slugs, or null for all workspaces" };
  }
  if (raw.length === 0) return { ok: true, workspaces: null };
  const list = [...new Set(raw.map((v) => String(v).trim()).filter((v) => valid.has(v)))];
  if (list.length === 0) {
    return {
      ok: false,
      error:
        "None of the selected workspaces exist any more — pick an existing workspace, or clear the selection for all workspaces",
    };
  }
  return { ok: true, workspaces: list };
}
