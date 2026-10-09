export const dynamic = "force-dynamic";

import { requirePortalUser } from "@/lib/api/requirePortalUser";
import { createAssetResponse, handled, listAssetsResponse } from "@/lib/clientAssetHttp";

/**
 * The signed-in client's own assets: My Brand (?section=brand) and Ad
 * Creatives (?section=creative). POST starts a My Brand upload or adds a
 * link — creatives are admin-only (enforced in lib/clientAssetRules.ts).
 */
export async function GET(request: Request) {
  const guard = await requirePortalUser();
  if (guard.response) return guard.response;
  return handled("portal/assets GET", () => listAssetsResponse(guard.user.id, request, "client"));
}

export async function POST(request: Request) {
  const guard = await requirePortalUser();
  if (guard.response) return guard.response;
  const { user } = guard;
  return handled("portal/assets POST", () =>
    createAssetResponse(user.id, request, { role: "client", id: user.id, name: user.displayName })
  );
}
