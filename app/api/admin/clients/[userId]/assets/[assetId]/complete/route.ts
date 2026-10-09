export const dynamic = "force-dynamic";

import { requireClientRouteActor } from "@/lib/api/requireAdmin";
import { completeAssetResponse, handled } from "@/lib/clientAssetHttp";

/** Finish an upload: verify every chunk, build thumbnails, mark ready. */
export async function POST(
  request: Request,
  { params }: { params: { userId: string; assetId: string } }
) {
  const guard = await requireClientRouteActor(params.userId);
  if (guard.response) return guard.response;
  const { admin } = guard.actor;
  return handled("admin/client-assets complete POST", () =>
    completeAssetResponse(params.userId, params.assetId, request, {
      role: "admin",
      id: admin.id,
      name: admin.displayName ?? admin.username,
      username: admin.username,
    })
  );
}
