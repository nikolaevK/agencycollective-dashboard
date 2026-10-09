export const dynamic = "force-dynamic";

import { requirePortalUser } from "@/lib/api/requirePortalUser";
import { completeAssetResponse, handled } from "@/lib/clientAssetHttp";

/** Finish an upload: verify every chunk, build thumbnails, mark ready. */
export async function POST(request: Request, { params }: { params: { assetId: string } }) {
  const guard = await requirePortalUser();
  if (guard.response) return guard.response;
  const { user } = guard;
  return handled("portal/assets complete POST", () =>
    completeAssetResponse(user.id, params.assetId, request, {
      role: "client",
      id: user.id,
      name: user.displayName,
    })
  );
}
