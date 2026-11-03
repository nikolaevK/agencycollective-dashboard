/**
 * The `workspaces` value a token save sends (pure — unit tested).
 *
 * Create: the selection, or null (= all workspaces) when nothing is picked.
 * Edit: the same, but ONLY when the selection differs from the token's stored
 * restriction — otherwise undefined, so the field is left out of the PATCH
 * and an unrelated edit (rename, scopes, expiry) can never rewrite it.
 */
export function workspacesToSend(
  selected: string[],
  token: { workspaces: string[] | null } | null
): string[] | null | undefined {
  const next = selected.length > 0 ? selected : null;
  if (!token) return next;
  const before = new Set(token.workspaces ?? []);
  const after = new Set(selected);
  const unchanged = before.size === after.size && [...after].every((v) => before.has(v));
  return unchanged ? undefined : next;
}
