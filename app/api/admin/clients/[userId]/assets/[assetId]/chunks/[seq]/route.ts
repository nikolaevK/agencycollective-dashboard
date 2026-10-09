export const dynamic = "force-dynamic";

import { requireClientRouteActor } from "@/lib/api/requireAdmin";
import { handled, putChunkResponse } from "@/lib/clientAssetHttp";

/** One raw ≤3 MB chunk of an in-progress upload (application/octet-stream). */
export async function PUT(
  request: Request,
  { params }: { params: { userId: string; assetId: string; seq: string } }
) {
  const guard = await requireClientRouteActor(params.userId);
  if (guard.response) return guard.response;
  const { admin } = guard.actor;
  return handled("admin/client-assets chunk PUT", () =>
    putChunkResponse(params.userId, params.assetId, params.seq, request, {
      role: "admin",
      id: admin.id,
      name: admin.displayName ?? admin.username,
      username: admin.username,
    })
  );
}
