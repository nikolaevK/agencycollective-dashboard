export const dynamic = "force-dynamic";

import { requirePortalUser } from "@/lib/api/requirePortalUser";
import { handled, putChunkResponse } from "@/lib/clientAssetHttp";

/** One raw ≤3 MB chunk of an in-progress upload (application/octet-stream). */
export async function PUT(request: Request, { params }: { params: { assetId: string; seq: string } }) {
  const guard = await requirePortalUser();
  if (guard.response) return guard.response;
  const { user } = guard;
  return handled("portal/assets chunk PUT", () =>
    putChunkResponse(user.id, params.assetId, params.seq, request, {
      role: "client",
      id: user.id,
      name: user.displayName,
    })
  );
}
