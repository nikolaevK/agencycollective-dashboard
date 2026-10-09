export const dynamic = "force-dynamic";

import { requireClientRouteActor } from "@/lib/api/requireAdmin";
import { createAssetResponse, handled, listAssetsResponse } from "@/lib/clientAssetHttp";

interface RouteContext {
  params: { userId: string };
}

/**
 * A client's My Brand (?section=brand) + Ad Creatives (?section=creative).
 * Gated by the `users` permission via middleware (/api/admin/clients/*) and
 * workspace-scoped here (out-of-scope client → 404).
 */
export async function GET(request: Request, { params }: RouteContext) {
  const guard = await requireClientRouteActor(params.userId);
  if (guard.response) return guard.response;
  return handled("admin/client-assets GET", () => listAssetsResponse(params.userId, request, "admin"));
}

export async function POST(request: Request, { params }: RouteContext) {
  const guard = await requireClientRouteActor(params.userId);
  if (guard.response) return guard.response;
  const { admin } = guard.actor;
  return handled("admin/client-assets POST", () =>
    createAssetResponse(params.userId, request, {
      role: "admin",
      id: admin.id,
      name: admin.displayName ?? admin.username,
      username: admin.username,
    })
  );
}
