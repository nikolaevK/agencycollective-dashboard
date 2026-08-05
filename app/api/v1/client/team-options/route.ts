export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { tokenWorkspaceScope } from "@/lib/apiScopes";
import { workspaceMembershipOf, scopesOverlap } from "@/lib/workspaces";
import { authenticateApiRequest } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { readAdmins } from "@/lib/admins";

export function OPTIONS() {
  return corsPreflight();
}

/** Admins assignable as Head-of-Ads / Media Buyer / CSM. Never exposes hashes. */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "client:read");
  if (!auth.ok) return auth.response;

  try {
    let admins = await readAdmins();
  // Workspace-restricted tokens only see admins who BELONG to one of their
  // books (membership, not privilege — mirrors the dashboard pickers).
  const wsRestriction = tokenWorkspaceScope(auth.token);
  if (wsRestriction) {
    admins = admins.filter((a) => scopesOverlap(wsRestriction, workspaceMembershipOf(a)));
  }
    return ok(
      admins.map((a) => ({
        id: a.id,
        name: a.displayName ?? a.username,
        avatarPath: a.avatarPath,
        isMediaBuyer: Boolean(a.permissions.media),
        isCsm: a.role === "csm",
      }))
    );
  } catch (err) {
    console.error("GET /api/v1/client/team-options error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
