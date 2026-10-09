export const dynamic = "force-dynamic";

import { requirePortalUser } from "@/lib/api/requirePortalUser";
import { deleteAssetResponse, handled } from "@/lib/clientAssetHttp";

/** Clients may delete only the My Brand files they uploaded themselves. */
export async function DELETE(_request: Request, { params }: { params: { assetId: string } }) {
  const guard = await requirePortalUser();
  if (guard.response) return guard.response;
  const { user } = guard;
  return handled("portal/assets DELETE", () =>
    deleteAssetResponse(user.id, params.assetId, { role: "client", id: user.id, name: user.displayName })
  );
}
