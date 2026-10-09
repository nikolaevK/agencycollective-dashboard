export const dynamic = "force-dynamic";

import { requireClientRouteActor } from "@/lib/api/requireAdmin";
import { assetFileResponse, handled } from "@/lib/clientAssetHttp";

/** Asset bytes: ?variant=thumb|preview|original (+ &download=1). Range-aware. */
export async function GET(
  request: Request,
  { params }: { params: { userId: string; assetId: string } }
) {
  const guard = await requireClientRouteActor(params.userId);
  if (guard.response) return guard.response;
  return handled("admin/client-assets file GET", () =>
    assetFileResponse(params.userId, params.assetId, request)
  );
}
