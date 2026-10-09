export const dynamic = "force-dynamic";

import { requireClientRouteActor } from "@/lib/api/requireAdmin";
import { deleteAssetResponse, handled } from "@/lib/clientAssetHttp";

export async function DELETE(
  _request: Request,
  { params }: { params: { userId: string; assetId: string } }
) {
  const guard = await requireClientRouteActor(params.userId);
  if (guard.response) return guard.response;
  const { admin } = guard.actor;
  return handled("admin/client-assets DELETE", () =>
    deleteAssetResponse(params.userId, params.assetId, {
      role: "admin",
      id: admin.id,
      name: admin.displayName ?? admin.username,
      username: admin.username,
    })
  );
}
