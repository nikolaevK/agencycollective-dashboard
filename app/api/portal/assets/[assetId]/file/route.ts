export const dynamic = "force-dynamic";

import { requirePortalUser } from "@/lib/api/requirePortalUser";
import { assetFileResponse, handled } from "@/lib/clientAssetHttp";

/** Asset bytes: ?variant=thumb|preview|original (+ &download=1). Range-aware. */
export async function GET(request: Request, { params }: { params: { assetId: string } }) {
  const guard = await requirePortalUser();
  if (guard.response) return guard.response;
  return handled("portal/assets file GET", () => assetFileResponse(guard.user.id, params.assetId, request));
}
